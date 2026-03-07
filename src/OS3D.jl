module OS3D

using JSON3

# ICP dependencies
using NearestNeighbors
using StatsBase
using Statistics
using MultivariateStats
using LinearAlgebra

# Include library modules
include("lib/ply_handler.jl")
include("lib/hole_detection.jl")

# Include ICP code
include("icp/icp.jl")
include("lib/comparison.jl")

using .PLYHandler
using .HoleDetection

# Global state for comparison
const comparison_running = Ref(false)

"""
    handle_command(cmd::Dict) -> Dict

Dispatch a JSON command to the appropriate handler function.
"""
function handle_command(cmd::Dict)
    command = get(cmd, "command", "")

    try
        if command == "list_ply"
            directory = get(cmd, "directory", "")
            if !isdir(directory)
                return Dict("error" => "Invalid directory", "files" => [])
            end
            files = get_ply_files(directory)
            return Dict("files" => files, "count" => length(files))

        elseif command == "detect_holes"
            filepath = get(cmd, "path", "")
            ext = lowercase(splitext(filepath)[2])
            if !isfile(filepath) || ext != ".ply"
                return Dict("error" => "Invalid mesh file (must be PLY)")
            end
            boundary_indices = detect_boundary_vertices(filepath)
            return Dict(
                "success" => true,
                "boundaryIndices" => boundary_indices,
                "count" => length(boundary_indices)
            )

        elseif command == "save_all_landmarks"
            files_data = get(cmd, "files", [])
            source_directory = get(cmd, "sourceDirectory", "")

            if isempty(source_directory)
                return Dict("error" => "Source directory not specified")
            end

            create_processed_dir(source_directory)

            saved = String[]
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

            return Dict(
                "success" => length(errors) == 0,
                "saved" => saved,
                "errors" => errors
            )

        elseif command == "import_processed"
            directory = get(cmd, "directory", "")
            if !isdir(directory)
                return Dict("error" => "Invalid directory")
            end
            return import_processed_landmarks(directory)

        elseif command == "analysis_files"
            directory = get(cmd, "directory", "")
            if !isdir(directory)
                return Dict("error" => "Invalid directory")
            end

            xyz_files = get_xyz_files(directory)
            left_files, right_files = separate_left_right(xyz_files)

            return Dict(
                "leftFiles" => left_files,
                "rightFiles" => right_files,
                "leftCount" => length(left_files),
                "rightCount" => length(right_files)
            )

        elseif command == "run_comparison"
            left_files = convert(Vector{String}, get(cmd, "leftFiles", String[]))
            right_files = convert(Vector{String}, get(cmd, "rightFiles", String[]))
            percentage = Float64(get(cmd, "percentage", 0.95))

            if isempty(left_files) || isempty(right_files)
                return Dict("error" => "Need both left and right files")
            end

            comparison_running[] = true
            try
                results = run_comparison(left_files, right_files, percentage)
                comparison_running[] = false

                results_data = [
                    Dict(
                        "leftFile" => r.left_file,
                        "rightFile" => r.right_file,
                        "distance" => round(r.distance, digits=4)
                    )
                    for r in results
                ]

                return Dict(
                    "success" => true,
                    "results" => results_data,
                    "totalComparisons" => length(results)
                )
            catch e
                comparison_running[] = false
                return Dict("error" => string(e))
            end

        elseif command == "comparison_status"
            return Dict("running" => comparison_running[])

        else
            return Dict("error" => "Unknown command: $command")
        end

    catch e
        return Dict("error" => string(e))
    end
end

"""
    sidecar_main()

Main loop for the sidecar process. Reads JSON commands from stdin,
dispatches to handlers, and writes JSON responses to stdout.
"""
function sidecar_main()
    while !eof(stdin)
        line = readline(stdin)
        isempty(strip(line)) && continue

        try
            cmd = JSON3.read(line, Dict{String,Any})
            result = handle_command(cmd)
            println(stdout, JSON3.write(result))
            flush(stdout)
        catch e
            error_response = Dict("error" => "Failed to parse command: $(string(e))")
            println(stdout, JSON3.write(error_response))
            flush(stdout)
        end
    end
end

# Entry point for compiled executable
function julia_main()::Cint
    try
        sidecar_main()
    catch e
        println(stderr, "OS3D fatal error: $(string(e))")
        return 1
    end
    return 0
end

end
