# Comparison Module
# Placeholder for ICP comparison

module Comparison

export run_comparison, ComparisonResult, separate_left_right, get_xyz_files

struct ComparisonResult
    left_file::String
    right_file::String
    distance::Float64
end

function run_comparison(left_files::Vector{String}, right_files::Vector{String}, percentage::Float64)
    # Placeholder - returns empty results
    return ComparisonResult[]
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
