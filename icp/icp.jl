# Main ICP function for new XYZ format
# Updated to work with read_xyz and use only mesh vertices for distance calculation

include("xyz_reader.jl")
include("knn_ind_dst.jl")
include("point_to_plane.jl")
include("point_to_point.jl")
include("fragment_landmarks.jl")
include("alignment_landmarks.jl")

# Worker function for distributed OMS comparison
@everywhere function OMS_worker(filelist1_path::String, filelist2::Vector{String}, k::Int)
    # Load fixed point cloud using new format
    data_fix = read_xyz(filelist1_path)
    
    Results = zeros(length(filelist2), 3)
    
    for (i, filepath) in enumerate(filelist2)
        data_mov = read_xyz(filepath)
        
        # Calculate correspondences based on 20% of points
        co = Int(round(size(data_fix.vertices, 1) * 0.2))
        
        # Run simplified ICP
        MDH = simpleicp_new(data_fix, data_mov, correspondences=co)
        
        Results[i, 1] = k
        Results[i, 2] = i
        Results[i, 3] = MDH
    end
    
    return Results
end

# Main distributed OMS function  
function OMS(filelist1::Vector{String}, filelist2::Vector{String})
    n1 = length(filelist1)
    n2 = length(filelist2)
    Results = SharedArray{Float64}(n2 * n1, 3)
    
    @sync @distributed for k in 1:n1
        Results[((k * n2) - n2 + 1):(k * n2), :] = OMS_worker(filelist1[k], filelist2, k)
    end
    
    return Results
end

# simpleicp_new - Simplified ICP for new XYZ format
# Uses:
# - Mesh vertices only (landmarks excluded) for point cloud registration
# - Landmarks for initial alignment if available
# - Boundary indices for excluding fragment margins from Hausdorff distance
@everywhere function simpleicp_new(data_fix, data_mov; 
                                    correspondences::Integer=1000, 
                                    neighbors::Integer=10, 
                                    min_planarity::Number=0.3, 
                                    min_change::Number=3, 
                                    max_iterations::Integer=100,
                                    hausdorff_percentile::Float64=0.95)
    
    X_fix = data_fix.vertices
    X_mov = copy(data_mov.vertices)
    
    correspondences >= 10 || error("correspondences must be >= 10")
    min_planarity >= 0 && min_planarity < 1 || error("min_planarity must be >= 0 and < 1")
    neighbors >= 2 || error("neighbors must be >= 2")
    min_change > 0 || error("min_change must be > 0")
    max_iterations > 0 || error("max_iterations must be > 0")
    
    # Mirror X for left/right comparison
    X_mov[:, 1] = X_mov[:, 1] * -1
    
    # Initial alignment using landmarks
    fix_coords, mov_coords = get_corresponding_landmark_coords(data_fix, data_mov)
    
    if size(fix_coords, 1) >= 3
        @info "Start point-to-point initial alignment with $(size(fix_coords, 1)) landmarks..."
        # Mirror the moving landmarks X coordinate too
        mov_coords[:, 1] = mov_coords[:, 1] * -1
        R = trafo(mov_coords, fix_coords)
        X_mov = applyTrafo(X_mov, R)
    end
    
    # Create point clouds
    pcfix = PointCloud(X_fix[:, 1], X_fix[:, 2], X_fix[:, 3])
    pcmov = PointCloud(X_mov[:, 1], X_mov[:, 2], X_mov[:, 3])
    
    select_n_points!(pcfix, correspondences)
    sel_orig = pcfix.sel
    estimate_normals!(pcfix, neighbors)
    
    H = Matrix{Float64}(I, 4, 4)
    residual_distances = Any[]
    
    @info "Start point-to-plane alignment..."
    for i in 1:max_iterations
        initial_distances = matching!(pcmov, pcfix)
        reject!(pcmov, pcfix, min_planarity, initial_distances)
        
        dH, residuals = estimate_rigid_body_transformation(
            pcfix.x[pcfix.sel], pcfix.y[pcfix.sel], pcfix.z[pcfix.sel],
            pcfix.nx[pcfix.sel], pcfix.ny[pcfix.sel], pcfix.nz[pcfix.sel],
            pcmov.x[pcmov.sel], pcmov.y[pcmov.sel], pcmov.z[pcmov.sel]
        )
        
        push!(residual_distances, residuals)
        transform!(pcmov, dH)
        pcfix.sel = sel_orig
        
        if i > 1
            if check_convergence_criteria(residual_distances[i], residual_distances[i-1], min_change)
                @info "Convergence criteria fulfilled after $i iterations!"
                break
            end
        end
    end
    
    @info "Calculating Hausdorff distance..."
    
    # Use boundary indices from XYZData (already excludes landmarks)
    HDist = remove_fragmented_margins(
        hcat(pcfix.x, pcfix.y, pcfix.z),
        hcat(pcmov.x, pcmov.y, pcmov.z),
        data_fix.boundary_indices,
        data_mov.boundary_indices;
        percentile=hausdorff_percentile
    )
    
    return HDist
end