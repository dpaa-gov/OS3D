# Comparison Module
# Runs ICP comparisons directly using threads

module Comparison

export run_comparison, ComparisonResult, separate_left_right, get_xyz_files

struct ComparisonResult
    left_file::String
    right_file::String
    distance::Float64
end

"""
    run_comparison(left_files, right_files, percentage) -> Vector{ComparisonResult}

Run threaded ICP comparison directly (no separate server).
"""
function run_comparison(left_files::Vector{String}, right_files::Vector{String}, percentage::Float64)
    raw_results = Main.OMS(left_files, right_files, percentage)
    
    results = ComparisonResult[]
    for i in 1:size(raw_results, 1)
        push!(results, ComparisonResult(
            basename(left_files[Int(raw_results[i, 1])]),
            basename(right_files[Int(raw_results[i, 2])]),
            raw_results[i, 3]
        ))
    end
    
    return results
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
