# PLY File Handler Module
# Provides functions for reading PLY files and exporting to XYZ format with landmarks

module PLYHandler

export read_ply_binary, write_xyz_with_landmarks, copy_to_processed, get_ply_files, create_processed_dir, import_processed_landmarks



"""
Helper to get type size in bytes for PLY property types
"""
function get_type_size(t::String)::Int
    if t in ["float", "float32", "int", "int32", "uint", "uint32"]
        return 4
    elseif t in ["double", "float64", "int64", "uint64"]
        return 8
    elseif t in ["char", "uchar", "int8", "uint8"]
        return 1
    elseif t in ["short", "int16", "ushort", "uint16"]
        return 2
    else
        return 4  # default to 4
    end
end

"""
    read_ply_binary(filepath::String) -> Dict

Read a PLY file (binary or ASCII) and return vertex data.
"""
function read_ply_binary(filepath::String)
    if !isfile(filepath)
        error("File not found: $filepath")
    end
    
    vertices = Vector{Vector{Float64}}()
    
    open(filepath, "r") do io
        # Parse header
        vertex_count = 0
        is_binary = false
        elements = Vector{Dict{String,Any}}()
        current_element = nothing
        
        while !eof(io)
            line = readline(io)
            
            if startswith(line, "format binary_little_endian") || startswith(line, "format binary_big_endian")
                is_binary = true
            elseif startswith(line, "format ascii")
                is_binary = false
            elseif startswith(line, "element")
                parts = split(line)
                elem_name = String(parts[2])
                elem_count = parse(Int, parts[3])
                current_element = Dict{String,Any}(
                    "name" => elem_name,
                    "count" => elem_count,
                    "properties" => Vector{Dict{String,Any}}()
                )
                push!(elements, current_element)
                
                if elem_name == "vertex"
                    vertex_count = elem_count
                end
            elseif startswith(line, "property list")
                parts = split(line)
                prop = Dict{String,Any}(
                    "type" => "list",
                    "count_type" => String(parts[3]),
                    "value_type" => String(parts[4]),
                    "name" => String(parts[5])
                )
                if current_element !== nothing
                    push!(current_element["properties"], prop)
                end
            elseif startswith(line, "property")
                parts = split(line)
                prop = Dict{String,Any}(
                    "type" => String(parts[2]),
                    "name" => String(parts[3])
                )
                if current_element !== nothing
                    push!(current_element["properties"], prop)
                end
            elseif line == "end_header"
                break
            end
        end
        
        # Process elements
        for elem in elements
            elem_name = elem["name"]
            elem_count = elem["count"]
            props = elem["properties"]
            
            if elem_name == "vertex"
                # Calculate bytes per vertex for binary
                bytes_per_vertex = 0
                for prop in props
                    if prop["type"] != "list"
                        bytes_per_vertex += get_type_size(prop["type"])
                    end
                end
                
                if is_binary
                    # Determine actual types for x, y, z from header
                    xyz_types = [prop["type"] for prop in props[1:min(3, length(props))]]
                    
                    for _ in 1:elem_count
                        # Read x, y, z using correct types from header
                        xyz = Float64[]
                        xyz_bytes = 0
                        for i in 1:3
                            t = i <= length(xyz_types) ? xyz_types[i] : "float"
                            if t in ["double", "float64"]
                                push!(xyz, ltoh(read(io, Float64)))
                                xyz_bytes += 8
                            else
                                push!(xyz, Float64(ltoh(read(io, Float32))))
                                xyz_bytes += 4
                            end
                        end
                        push!(vertices, xyz)
                        
                        # Skip remaining bytes
                        remaining = bytes_per_vertex - xyz_bytes
                        if remaining > 0
                            skip(io, remaining)
                        end
                    end
                else
                    for _ in 1:elem_count
                        line = readline(io)
                        parts = split(line)
                        if length(parts) >= 3
                            x = parse(Float64, parts[1])
                            y = parse(Float64, parts[2])
                            z = parse(Float64, parts[3])
                            push!(vertices, [x, y, z])
                        end
                    end
                end
            else
                # Skip other elements
                if is_binary
                    for _ in 1:elem_count
                        for prop in props
                            if prop["type"] == "list"
                                count_size = get_type_size(prop["count_type"])
                                value_size = get_type_size(prop["value_type"])
                                
                                count = if count_size == 1
                                    Int(read(io, UInt8))
                                elseif count_size == 2
                                    Int(ltoh(read(io, UInt16)))
                                else
                                    Int(ltoh(read(io, UInt32)))
                                end
                                skip(io, count * value_size)
                            else
                                skip(io, get_type_size(prop["type"]))
                            end
                        end
                    end
                else
                    for _ in 1:elem_count
                        readline(io)
                    end
                end
            end
        end
    end
    
    return Dict(
        "filepath" => filepath,
        "filename" => basename(filepath),
        "vertices" => vertices,
        "vertex_count" => length(vertices)
    )
end

"""
    write_xyz_with_landmarks(filepath::String, ply_data::Dict, landmarks::Vector, boundary_indices::AbstractVector=Int[])

Write an XYZ file containing all vertices, with landmarks marked with L suffix
and boundary vertices marked with B suffix.
Format: x y z [B] [L<index>]
"""
function write_xyz_with_landmarks(filepath::String, ply_data::Dict, landmarks::Vector, boundary_indices::AbstractVector=Int[])
    # Create directory if needed
    dir = dirname(filepath)
    if !isempty(dir) && !isdir(dir)
        mkpath(dir)
    end
    
    # Change extension to .xyz
    xyz_path = replace(filepath, r"\.ply$"i => ".xyz")
    
    vertices = ply_data["vertices"]
    
    # Convert boundary_indices to a Set of Int for O(1) lookup
    # Handle potential Any type from JSON parsing
    boundary_set = Set{Int}(Int(i) for i in boundary_indices)
    
    open(xyz_path, "w") do io
        # Write all vertices, marking boundary vertices with B
        for (idx, vertex) in enumerate(vertices)
            # PLY vertex indices are 0-based, so we need to adjust
            if (idx - 1) in boundary_set
                println(io, "$(vertex[1]) $(vertex[2]) $(vertex[3]) B")
            else
                println(io, "$(vertex[1]) $(vertex[2]) $(vertex[3])")
            end
        end
        
        # Write landmarks with L marker at the end (use actual landmark number, not sequential index)
        for lm in landmarks
            x = get(lm, "x", 0.0)
            y = get(lm, "y", 0.0)
            z = get(lm, "z", 0.0)
            lm_num = get(lm, "index", 0)
            println(io, "$x $y $z L$lm_num")
        end
    end
    
    return xyz_path
end

"""
    copy_to_processed(source_dir::String, filename::String, ply_data::Dict, landmarks::Vector, boundary_indices::Vector=Int[])

Save an XYZ file with landmarks and boundary markers to the 'processed' subdirectory.
"""
function copy_to_processed(source_dir::String, filename::String, ply_data::Dict, landmarks::Vector, boundary_indices::Vector=Int[])
    processed_dir = joinpath(source_dir, "processed")
    if !isdir(processed_dir)
        mkpath(processed_dir)
    end
    
    # Use original filename but save as .xyz
    output_path = joinpath(processed_dir, filename)
    return write_xyz_with_landmarks(output_path, ply_data, landmarks, boundary_indices)
end

"""
    create_processed_dir(source_dir::String)

Create the 'processed' subdirectory if it doesn't exist.
"""
function create_processed_dir(source_dir::String)
    processed_dir = joinpath(source_dir, "processed")
    if !isdir(processed_dir)
        mkpath(processed_dir)
    end
    return processed_dir
end

"""
    get_ply_files(directory::String) -> Vector{String}

Get all PLY files in a directory (non-recursive).
"""
function get_ply_files(directory::String)
    if !isdir(directory)
        return String[]
    end
    
    files = readdir(directory, join=true)
    ply_files = filter(f -> isfile(f) && lowercase(splitext(f)[2]) == ".ply", files)
    return sort(ply_files)
end

"""
    import_processed_landmarks(directory::String) -> Dict

Scan the 'processed/' subfolder for .xyz files and parse out
landmarks (L markers) and boundary vertex indices (B markers).
Returns a Dict mapping PLY filenames to their landmarks and boundaries.
"""
function import_processed_landmarks(directory::String)
    processed_dir = joinpath(directory, "processed")
    if !isdir(processed_dir)
        return Dict("files" => [], "count" => 0)
    end

    xyz_files = filter(f -> lowercase(splitext(f)[2]) == ".xyz", readdir(processed_dir))
    
    results = []
    
    for xyz_file in xyz_files
        xyz_path = joinpath(processed_dir, xyz_file)
        landmarks = []
        boundary_indices = Int[]
        vertex_index = 0
        
        try
            for line in eachline(xyz_path)
                parts = split(strip(line))
                length(parts) < 3 && continue
                
                # Check for landmark marker (last part starts with L)
                last_part = parts[end]
                if startswith(last_part, "L") && length(last_part) > 1
                    lm_num_str = last_part[2:end]
                    lm_num = tryparse(Int, lm_num_str)
                    if lm_num !== nothing
                        x = parse(Float64, parts[1])
                        y = parse(Float64, parts[2])
                        z = parse(Float64, parts[3])
                        push!(landmarks, Dict(
                            "x" => x,
                            "y" => y, 
                            "z" => z,
                            "index" => lm_num
                        ))
                    end
                    continue
                end
                
                # Check for boundary marker
                if last_part == "B"
                    push!(boundary_indices, vertex_index)
                end
                
                vertex_index += 1
            end
        catch e
            @warn "Failed to parse $xyz_file: $e"
            continue
        end
        
        # Map back to PLY filename
        ply_filename = replace(xyz_file, r"\.xyz$"i => ".ply")
        # Find the full PLY path
        ply_path = joinpath(directory, ply_filename)
        
        if isfile(ply_path) && (!isempty(landmarks) || !isempty(boundary_indices))
            push!(results, Dict(
                "plyPath" => ply_path,
                "landmarks" => landmarks,
                "boundaryIndices" => boundary_indices
            ))
        end
    end
    
    return Dict("files" => results, "count" => length(results))
end

end # module
