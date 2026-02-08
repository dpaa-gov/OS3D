# Routes for OS3D API
using .PLYHandler
using .Comparison
using .HoleDetection

# Global state for comparison
comparison_running = Ref(false)
comparison_results = Ref{Vector{ComparisonResult}}(ComparisonResult[])

# Heartbeat monitoring — auto-shutdown when browser closes
const HEARTBEAT_TIMEOUT = 15.0  # seconds without heartbeat before shutdown
last_heartbeat = Ref(Base.time())
heartbeat_active = Ref(false)  # only start monitoring after first heartbeat

# Serve main page
route("/") do
    Genie.Renderer.respond(read(joinpath(@__DIR__, "views", "index.html"), String), "text/html")
end

# Serve favicon
route("/favicon.ico") do
    filepath = joinpath(@__DIR__, "public", "images", "favicon.png")
    if isfile(filepath)
        return Genie.Renderer.respond(
            read(filepath, String),
            "image/png"
        )
    end
    return Genie.Renderer.respond("Not found", 404)
end

# Serve static files
route("/css/:file") do
    filepath = joinpath(@__DIR__, "public", "css", payload(:file))
    if isfile(filepath)
        return Genie.Renderer.respond(
            read(filepath, String),
            "text/css"
        )
    end
    return Genie.Renderer.respond("Not found", 404)
end

route("/js/:file") do
    filepath = joinpath(@__DIR__, "public", "js", payload(:file))
    if isfile(filepath)
        return Genie.Renderer.respond(
            read(filepath, String),
            "application/javascript"
        )
    end
    return Genie.Renderer.respond("Not found", 404)
end

# Serve raw PLY files for Three.js PLYLoader
route("/api/ply/raw", method=POST) do
    data = jsonpayload()
    filepath = get(data, "path", "")
    
    ext = lowercase(splitext(filepath)[2])
    if !isfile(filepath) || ext != ".ply"
        return json(Dict("error" => "Invalid mesh file (must be PLY)"))
    end
    
    # Read file as binary and return with appropriate content type
    content = read(filepath)
    
    # Return raw HTTP response for binary data
    return HTTP.Response(200, 
        ["Content-Type" => "application/octet-stream", 
         "Content-Length" => string(length(content))],
        body = content)
end

# Detect boundary vertices (holes) in a mesh
route("/api/mesh/boundaries", method=POST) do
    data = jsonpayload()
    filepath = get(data, "path", "")
    
    ext = lowercase(splitext(filepath)[2])
    if !isfile(filepath) || ext != ".ply"
        return json(Dict("error" => "Invalid mesh file"))
    end
    
    try
        boundary_indices = detect_boundary_vertices(filepath)
        return json(Dict(
            "success" => true,
            "boundaryIndices" => boundary_indices,
            "count" => length(boundary_indices)
        ))
    catch e
        return json(Dict("error" => string(e)))
    end
end

# Get user's home directory (cross-platform)
route("/api/homedir") do
    return json(Dict("path" => homedir()))
end

# Browse directories
route("/api/browse", method=POST) do
    data = jsonpayload()
    path = get(data, "path", "/")
    
    if !isdir(path)
        return json(Dict("error" => "Not a valid directory", "entries" => []))
    end
    
    entries = []
    try
        for name in readdir(path)
            try
                full_path = joinpath(path, name)
                entry = Dict(
                    "name" => name,
                    "path" => full_path,
                    "isDirectory" => isdir(full_path),
                    "isMesh" => isfile(full_path) && lowercase(splitext(name)[2]) == ".ply"
                )
                push!(entries, entry)
            catch
                # Skip inaccessible files (e.g. locked system files on Windows)
                continue
            end
        end
    catch e
        return json(Dict("error" => string(e), "entries" => []))
    end
    
    # Sort: directories first, then files
    sort!(entries, by = e -> (!e["isDirectory"], e["name"]))
    
    return json(Dict("entries" => entries, "currentPath" => path))
end

# Get PLY files in directory
route("/api/ply/list", method=POST) do
    data = jsonpayload()
    directory = get(data, "directory", "")
    
    if !isdir(directory)
        return json(Dict("error" => "Invalid directory", "files" => []))
    end
    
    ply_files = get_ply_files(directory)
    
    return json(Dict(
        "files" => ply_files,
        "count" => length(ply_files)
    ))
end

# Save landmarks to PLY file
route("/api/landmarks/save", method=POST) do
    data = jsonpayload()
    filepath = get(data, "filepath", "")
    landmarks = get(data, "landmarks", [])
    save_to_processed = get(data, "saveToProcessed", false)
    source_directory = get(data, "sourceDirectory", "")
    
    if !isfile(filepath)
        return json(Dict("error" => "File not found"))
    end
    
    try
        original_data = read_ply_binary(filepath)
        
        if save_to_processed && !isempty(source_directory)
            output_path = copy_to_processed(source_directory, basename(filepath), original_data, landmarks)
        else
            output_path = write_xyz_with_landmarks(filepath, original_data, landmarks)
        end
        
        return json(Dict("success" => true, "path" => output_path))
    catch e
        return json(Dict("error" => string(e)))
    end
end

# Global save all landmarks to processed folder
route("/api/landmarks/saveall", method=POST) do
    data = jsonpayload()
    files_data = get(data, "files", [])  # Array of {filepath, landmarks}
    source_directory = get(data, "sourceDirectory", "")
    
    if isempty(source_directory)
        return json(Dict("error" => "Source directory not specified"))
    end
    
    # Create processed directory
    create_processed_dir(source_directory)
    
    saved = []
    errors = []
    
    for file_info in files_data
        filepath = get(file_info, "filepath", "")
        landmarks = get(file_info, "landmarks", [])
        boundary_indices = get(file_info, "boundaryIndices", Int[])
        
        if !isfile(filepath)
            push!(errors, Dict("file" => filepath, "error" => "File not found"))
            continue
        end
        
        try
            original_data = read_ply_binary(filepath)
            output_path = copy_to_processed(source_directory, basename(filepath), original_data, landmarks, boundary_indices)
            push!(saved, output_path)
        catch e
            push!(errors, Dict("file" => filepath, "error" => string(e)))
        end
    end
    
    return json(Dict(
        "success" => length(errors) == 0,
        "saved" => saved,
        "errors" => errors
    ))
end

# Get left/right file lists for analysis
route("/api/analysis/files", method=POST) do
    data = jsonpayload()
    directory = get(data, "directory", "")
    
    if !isdir(directory)
        return json(Dict("error" => "Invalid directory"))
    end
    
    xyz_files = Comparison.get_xyz_files(directory)
    left_files, right_files = Comparison.separate_left_right(xyz_files)
    
    return json(Dict(
        "leftFiles" => left_files,
        "rightFiles" => right_files,
        "leftCount" => length(left_files),
        "rightCount" => length(right_files)
    ))
end

# Run comparison analysis
route("/api/analysis/run", method=POST) do
    data = jsonpayload()
    left_files = get(data, "leftFiles", String[])
    right_files = get(data, "rightFiles", String[])
    percentage = get(data, "percentage", 0.95)
    
    if isempty(left_files) || isempty(right_files)
        return json(Dict("error" => "Need both left and right files"))
    end
    
    comparison_running[] = true
    
    try
        results = run_comparison(
            convert(Vector{String}, left_files),
            convert(Vector{String}, right_files),
            Float64(percentage)
        )
        
        comparison_running[] = false
        comparison_results[] = results
        
        # Convert results to JSON-friendly format
        results_data = [
            Dict(
                "leftFile" => r.left_file,
                "rightFile" => r.right_file,
                "distance" => round(r.distance, digits=4)
            )
            for r in results
        ]
        
        return json(Dict(
            "success" => true,
            "results" => results_data,
            "totalComparisons" => length(results)
        ))
    catch e
        comparison_running[] = false
        return json(Dict("error" => string(e)))
    end
end



# Check comparison status
route("/api/analysis/status", method=GET) do
    return json(Dict("running" => comparison_running[]))
end

# Heartbeat endpoint — called by frontend every 5 seconds
route("/api/heartbeat", method=POST) do
    last_heartbeat[] = Base.time()
    if !heartbeat_active[]
        heartbeat_active[] = true
        @info "Heartbeat monitoring activated — will auto-shutdown when browser closes"
        # Start the monitor task
        @async begin
            while true
                sleep(5)
                if heartbeat_active[] && (Base.time() - last_heartbeat[] > HEARTBEAT_TIMEOUT)
                    @info "No heartbeat for $(HEARTBEAT_TIMEOUT)s — browser closed, shutting down..."
                    # Signal ICP server to stop
                    try
                        HTTP.post("http://127.0.0.1:8001/stop"; connect_timeout=2, readtimeout=2)
                    catch
                        # ICP server may already be down
                    end
                    # Force-kill this process (exit() gets caught by Genie's event loop)
                    ccall(:exit, Cvoid, (Cint,), 0)
                end
            end
        end
    end
    return json(Dict("ok" => true))
end
