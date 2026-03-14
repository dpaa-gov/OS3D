# XYZ File Reader for New Format
# Simple functions (no module)

# Parsed XYZ file data struct
# - vertices: Nx3 matrix of mesh vertices (excludes landmarks)
# - landmarks: Vector of (landmark_index, x, y, z) tuples
# - guide_landmarks: Vector of (guide_index, x, y, z) tuples — low-weight alignment aids
# - boundary_indices: 1-based indices of boundary vertices
struct XYZData
    vertices::Matrix{Float64}
    landmarks::Vector{Tuple{Int,Float64,Float64,Float64}}
    guide_landmarks::Vector{Tuple{Int,Float64,Float64,Float64}}
    boundary_indices::Vector{Int}
end

# read_xyz(filepath::String) -> XYZData
# Read an XYZ file in the new format:
# - Lines with no 4th column: regular vertex
# - Lines with 4th column "B": boundary vertex
# - Lines with 4th column "Ln" (e.g., L1, L2): landmark point (excluded from vertices)
# - Lines with 4th column "Gn" (e.g., G1, G2): guide landmark (excluded from vertices)
# Returns XYZData with separated vertices, landmarks, guide landmarks, and boundary indices.
function read_xyz(filepath::String)
    if !isfile(filepath)
        error("File not found: $filepath")
    end
    
    vertices = Vector{Vector{Float64}}()
    landmarks = Vector{Tuple{Int,Float64,Float64,Float64}}()
    guide_landmarks = Vector{Tuple{Int,Float64,Float64,Float64}}()
    boundary_indices = Vector{Int}()
    
    vertex_index = 0
    
    open(filepath, "r") do io
        for line in eachline(io)
            line = strip(line)
            isempty(line) && continue
            
            parts = split(line)
            length(parts) >= 3 || continue
            
            # Parse coordinates
            x = tryparse(Float64, parts[1])
            y = tryparse(Float64, parts[2])
            z = tryparse(Float64, parts[3])
            
            # Skip if coordinates aren't valid numbers
            (x === nothing || y === nothing || z === nothing) && continue
            
            # Check for marker in 4th column
            marker = length(parts) >= 4 ? parts[4] : ""
            
            if startswith(marker, "L") && length(marker) > 1
                # Landmark row - parse landmark number and store separately
                landmark_num = tryparse(Int, marker[2:end])
                if landmark_num !== nothing
                    push!(landmarks, (landmark_num, x, y, z))
                end
                # Don't add to vertices - landmarks are separate
            elseif startswith(marker, "G") && length(marker) > 1
                # Guide landmark row - parse guide number and store separately
                guide_num = tryparse(Int, marker[2:end])
                if guide_num !== nothing
                    push!(guide_landmarks, (guide_num, x, y, z))
                end
                # Don't add to vertices - guide landmarks are separate
            else
                # Regular vertex or boundary vertex
                vertex_index += 1
                push!(vertices, [x, y, z])
                
                if marker == "B"
                    push!(boundary_indices, vertex_index)
                end
            end
        end
    end
    
    # Convert to matrix
    n_vertices = length(vertices)
    vertex_matrix = zeros(Float64, n_vertices, 3)
    for (i, v) in enumerate(vertices)
        vertex_matrix[i, :] = v
    end
    
    # Sort landmarks by index
    sort!(landmarks, by = x -> x[1])
    sort!(guide_landmarks, by = x -> x[1])
    
    return XYZData(vertex_matrix, landmarks, guide_landmarks, boundary_indices)
end

# get_landmark_coords(data::XYZData) -> Matrix{Float64}
# Get landmark coordinates as Nx3 matrix, sorted by landmark index.
function get_landmark_coords(data::XYZData)
    n = length(data.landmarks)
    if n == 0
        return zeros(Float64, 0, 3)
    end
    
    coords = zeros(Float64, n, 3)
    for (i, (_, x, y, z)) in enumerate(data.landmarks)
        coords[i, :] = [x, y, z]
    end
    return coords
end

# get_landmark_indices(data::XYZData) -> Vector{Int}
# Get landmark indices (1, 2, 3, etc.) in order.
function get_landmark_indices(data::XYZData)
    return [lm[1] for lm in data.landmarks]
end
