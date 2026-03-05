# Main ICP function for new XYZ format
# Updated to work with read_xyz and use only mesh vertices for distance calculation

include("xyz_reader.jl")
include("knn_ind_dst.jl")
include("point_to_plane.jl")
include("point_to_point.jl")
include("fragment_landmarks.jl")
include("alignment_landmarks.jl")

# Worker function for threaded OMS comparison
function OMS_worker(filelist1_path::String, filelist2::Vector{String}, k::Int; hausdorff_percentile::Float64=0.95)
    # Load fixed point cloud using new format
    data_fix = read_xyz(filelist1_path)
    
    # Pre-compute fixed PointCloud ONCE for all pairs
    # (normals + selected points are identical for every moving file)
    X_fix = data_fix.vertices
    co = Int(round(size(X_fix, 1) * 0.2))
    pcfix = PointCloud(X_fix[:, 1], X_fix[:, 2], X_fix[:, 3])
    select_n_points!(pcfix, co)
    sel_orig = pcfix.sel
    estimate_normals!(pcfix, 10)
    
    Results = zeros(length(filelist2), 3)
    
    for (i, filepath) in enumerate(filelist2)
        data_mov = read_xyz(filepath)
        
        # Run simplified ICP with pre-built fixed cloud
        MDH = simpleicp_new(data_fix, data_mov, pcfix, sel_orig;
                            correspondences=co, hausdorff_percentile=hausdorff_percentile)
        
        Results[i, 1] = k
        Results[i, 2] = i
        Results[i, 3] = MDH
    end
    
    return Results
end

# Main threaded OMS function  
function OMS(filelist1::Vector{String}, filelist2::Vector{String}, hausdorff_percentile::Float64=0.95)
    n1 = length(filelist1)
    n2 = length(filelist2)
    @info "OMS: $(n1) × $(n2) comparisons on $(Threads.nthreads()) threads"
    Results = zeros(Float64, n2 * n1, 3)
    
    tasks = map(1:n1) do k
        Threads.@spawn OMS_worker(filelist1[k], filelist2, k; hausdorff_percentile=hausdorff_percentile)
    end
    
    for (k, t) in enumerate(tasks)
        Results[((k * n2) - n2 + 1):(k * n2), :] = fetch(t)
    end
    
    return Results
end

# simpleicp_new - Simplified ICP for new XYZ format
# Uses:
# - Mesh vertices only (landmarks excluded) for point cloud registration
# - Landmarks for initial alignment if available
# - Boundary indices for excluding fragment margins from Hausdorff distance
# pcfix and sel_orig are pre-built by OMS_worker (shared across all pairs for the same fixed file)
function simpleicp_new(data_fix, data_mov, pcfix, sel_orig; 
                                    correspondences::Integer=1000, 
                                    neighbors::Integer=10, 
                                    min_planarity::Number=0.3, 
                                    min_change::Number=3, 
                                    max_iterations::Integer=100,
                                    hausdorff_percentile::Float64=0.95)
    
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

        # Mirror the moving landmarks X coordinate too
        mov_coords[:, 1] = mov_coords[:, 1] * -1

        # Center on landmark centroids, rotate, uncenter to fixed position
        cm = mean(mov_coords, dims=1)
        cf = mean(fix_coords, dims=1)
        R = compute_rotation(mov_coords, fix_coords)
        X_mov = (X_mov .- cm) * R .+ cf
    end

    # Create moving point cloud (fixed cloud is pre-built)
    pcmov = PointCloud(X_mov[:, 1], X_mov[:, 2], X_mov[:, 3])
    
    # Auto-estimate overlap ratio from vertex count ratio (percentile ICP)
    n_fix = size(data_fix.vertices, 1)
    n_mov = size(data_mov.vertices, 1)
    overlap_ratio = clamp(min(n_fix, n_mov) / max(n_fix, n_mov), 0.3, 1.0)
    
    # Restore fixed cloud selection for this pair
    pcfix.sel = sel_orig
    
    H = Matrix{Float64}(I, 4, 4)
    residual_distances = Any[]
    
    # Pre-compute query points — same every iteration since pcfix.sel is restored to sel_orig
    query_points = [pcfix.x[sel_orig]'; pcfix.y[sel_orig]'; pcfix.z[sel_orig]']
    

    for i in 1:max_iterations
        initial_distances = matching!(pcmov, pcfix, query_points)
        reject!(pcmov, pcfix, min_planarity, initial_distances; overlap_ratio=overlap_ratio)
        
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

                break
            end
        end
    end
    

    
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