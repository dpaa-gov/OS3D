# Extract initial alignment landmarks from XYZData
# Updated for new XYZ format with string markers

# extract_landmarks_new(data) -> Matrix{Int}
# Extract landmarks from XYZ data for initial alignment.
# Returns Nx2 matrix where each row is (landmark_index_in_file, landmark_number).
function extract_landmarks_new(data)
    landmarks = data.landmarks
    if isempty(landmarks)
        return zeros(Int, 0, 2)
    end
    
    result = zeros(Int, length(landmarks), 2)
    for (i, (landmark_num, _, _, _)) in enumerate(landmarks)
        result[i, 1] = i  # Index in landmarks array
        result[i, 2] = landmark_num  # Landmark number (1, 2, 3, etc.)
    end
    return result
end

# compare_landmarks(L1::Matrix, L2::Matrix) -> Matrix{Int}
# Compare two sets of landmarks to find common ones for initial alignment.
# Returns matrix of corresponding indices.
function compare_landmarks(L1::Matrix, L2::Matrix)
    if size(L1, 1) == 0 || size(L2, 1) == 0
        return zeros(Int, 0, 2)
    end
    
    max_size = max(size(L1, 1), size(L2, 1))
    ca = zeros(Int, max_size, 2)
    xi = 1
    
    for i in 1:size(L1, 1)
        for x in 1:size(L2, 1)
            if L1[i, 2] == L2[x, 2]
                ca[xi, 1] = L1[i, 1]
                ca[xi, 2] = L2[x, 1]
                xi += 1
            end
        end
    end
    
    if xi > 1
        xi -= 1
    end
    return ca[1:xi, :]
end

# get_corresponding_landmark_coords(data1, data2) -> (Matrix, Matrix)
# Get corresponding landmark coordinates from two XYZ datasets for alignment.
# Returns two Nx3 matrices of matching landmarks.
function get_corresponding_landmark_coords(data1, data2)
    L1 = extract_landmarks_new(data1)
    L2 = extract_landmarks_new(data2)
    
    correspondences = compare_landmarks(L1, L2)
    
    if size(correspondences, 1) == 0
        return zeros(Float64, 0, 3), zeros(Float64, 0, 3)
    end
    
    n = size(correspondences, 1)
    coords1 = zeros(Float64, n, 3)
    coords2 = zeros(Float64, n, 3)
    
    for i in 1:n
        idx1 = correspondences[i, 1]
        idx2 = correspondences[i, 2]
        
        _, x1, y1, z1 = data1.landmarks[idx1]
        _, x2, y2, z2 = data2.landmarks[idx2]
        
        coords1[i, :] = [x1, y1, z1]
        coords2[i, :] = [x2, y2, z2]
    end
    
    return coords1, coords2
end