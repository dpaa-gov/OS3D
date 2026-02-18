# Hole Detection Module
# Identifies boundary vertices in a mesh by finding edges that belong to only one face

module HoleDetection

export detect_boundary_vertices

"""
    detect_boundary_vertices(filepath::String) -> Vector{Int}

Detect boundary vertices in a PLY mesh file.
Boundary edges are edges that belong to only one face (indicating a hole/open edge).
Returns 0-indexed vertex indices for JavaScript compatibility.
"""
function detect_boundary_vertices(filepath::String)
    if !isfile(filepath)
        error("File not found: $filepath")
    end
    
    vertices = Vector{Vector{Float64}}()
    faces = Vector{Vector{Int}}()
    
    open(filepath, "r") do io
        # Parse header
        vertex_count = 0
        face_count = 0
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
                elseif elem_name == "face"
                    face_count = elem_count
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
                # Read vertices
                if is_binary
                    bytes_per_vertex = sum(get_type_size(p["type"]) for p in props if p["type"] != "list")
                    for _ in 1:elem_count
                        x = ltoh(read(io, Float32))
                        y = ltoh(read(io, Float32))
                        z = ltoh(read(io, Float32))
                        push!(vertices, [Float64(x), Float64(y), Float64(z)])
                        remaining = bytes_per_vertex - 12
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
            elseif elem_name == "face"
                # Read faces
                if is_binary
                    for _ in 1:elem_count
                        # Read vertex count (usually 3 for triangles)
                        count_prop = findfirst(p -> p["type"] == "list", props)
                        if count_prop !== nothing
                            prop = props[count_prop]
                            count_size = get_type_size(prop["count_type"])
                            value_size = get_type_size(prop["value_type"])
                            
                            n_verts = if count_size == 1
                                Int(read(io, UInt8))
                            elseif count_size == 2
                                Int(ltoh(read(io, UInt16)))
                            else
                                Int(ltoh(read(io, UInt32)))
                            end
                            
                            face_verts = Int[]
                            for _ in 1:n_verts
                                idx = if value_size == 1
                                    Int(read(io, UInt8))
                                elseif value_size == 2
                                    Int(ltoh(read(io, UInt16)))
                                else
                                    Int(ltoh(read(io, UInt32)))
                                end
                                push!(face_verts, idx)
                            end
                            push!(faces, face_verts)
                        end
                    end
                else
                    for _ in 1:elem_count
                        line = readline(io)
                        parts = split(line)
                        if length(parts) >= 4
                            n_verts = parse(Int, parts[1])
                            face_verts = [parse(Int, parts[i+1]) for i in 1:n_verts]
                            push!(faces, face_verts)
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
    
    # Build edge-to-face adjacency map
    # Edge is represented as sorted tuple of vertex indices
    edge_count = Dict{Tuple{Int,Int}, Int}()
    
    # Also build vertex adjacency map for neighbor expansion
    vertex_neighbors = Dict{Int, Set{Int}}()
    
    for face in faces
        n = length(face)
        for i in 1:n
            v1 = face[i]
            v2 = face[i % n + 1]  # Next vertex (wraps around)
            edge = v1 < v2 ? (v1, v2) : (v2, v1)
            edge_count[edge] = get(edge_count, edge, 0) + 1
            
            # Track mesh adjacency
            if !haskey(vertex_neighbors, v1)
                vertex_neighbors[v1] = Set{Int}()
            end
            if !haskey(vertex_neighbors, v2)
                vertex_neighbors[v2] = Set{Int}()
            end
            push!(vertex_neighbors[v1], v2)
            push!(vertex_neighbors[v2], v1)
        end
    end
    
    # Boundary edges are edges that appear in only one face
    boundary_vertices = Set{Int}()
    for (edge, count) in edge_count
        if count == 1
            push!(boundary_vertices, edge[1])
            push!(boundary_vertices, edge[2])
        end
    end
    
    # Expand boundary by including 1-ring mesh neighbors of each boundary vertex
    # This ensures a thicker, more continuous margin for conservative detection
    expanded = Set{Int}()
    for v in boundary_vertices
        push!(expanded, v)
        if haskey(vertex_neighbors, v)
            for neighbor in vertex_neighbors[v]
                push!(expanded, neighbor)
            end
        end
    end
    
    # Return sorted list (already 0-indexed from PLY file)
    return sort(collect(expanded))
end

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

end # module
