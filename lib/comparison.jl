# Comparison Module
# Calls the separate ICP server for distributed comparisons

module Comparison

export run_comparison, ComparisonResult, separate_left_right, get_xyz_files

using HTTP
using JSON3

const ICP_SERVER_URL = "http://127.0.0.1:8001"

struct ComparisonResult
    left_file::String
    right_file::String
    distance::Float64
end

"""
Check if ICP server is running and ready
"""
function check_icp_server()
    try
        resp = HTTP.get("$ICP_SERVER_URL/status", readtimeout=2)
        data = JSON3.read(String(resp.body))
        return data.ready
    catch
        return false
    end
end

"""
    run_comparison(left_files, right_files, percentage) -> Vector{ComparisonResult}

Run ICP comparison via the ICP server API.
"""
function run_comparison(left_files::Vector{String}, right_files::Vector{String}, percentage::Float64)
    if !check_icp_server()
        error("ICP server not running. Start it with: julia --project=. icp_server.jl")
    end
    
    # Call ICP server
    payload = JSON3.write(Dict(
        "leftFiles" => left_files,
        "rightFiles" => right_files,
        "percentage" => percentage
    ))
    
    resp = HTTP.post("$ICP_SERVER_URL/compare", 
        ["Content-Type" => "application/json"],
        body=payload,
        readtimeout=3600)  # Long timeout for big comparisons
    
    data = JSON3.read(String(resp.body))
    
    if !get(data, :success, false)
        error(get(data, :error, "Unknown error"))
    end
    
    # Convert to ComparisonResult array
    results = ComparisonResult[]
    for r in data.results
        push!(results, ComparisonResult(
            String(r.leftFile),
            String(r.rightFile),
            Float64(r.distance)
        ))
    end
    
    return results
end

function stop_comparison()
    try
        HTTP.post("$ICP_SERVER_URL/stop")
    catch
        # Ignore errors
    end
end

function separate_left_right(files::Vector{String})
    left = filter(f -> contains(lowercase(basename(f)), "left."), files)
    right = filter(f -> contains(lowercase(basename(f)), "right."), files)
    return (left, right)
end

function get_xyz_files(directory::String)
    files = [joinpath(directory, f) for f in readdir(directory) if endswith(lowercase(f), ".xyz")]
    return sort(files)
end

end # module
