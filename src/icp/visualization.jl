# Visualization ICP — returns per-vertex distances + aligned coordinates
# for heatmap and dual-color rendering in the frontend.

function visualize_pair_icp(left_path::String, right_path::String; hausdorff_percentile::Float64=0.95)
    data_fix = read_xyz(left_path)
    data_mov = read_xyz(right_path)

    X_fix = data_fix.vertices
    X_mov = copy(data_mov.vertices)

    # Subsample for ICP registration (same as production pipeline)
    co = Int(round(size(X_fix, 1) * 0.2))

    pcfix = PointCloud(X_fix[:, 1], X_fix[:, 2], X_fix[:, 3])
    select_n_points!(pcfix, co)
    sel_orig = pcfix.sel
    estimate_normals!(pcfix, 10)

    # Mirror X for left/right comparison
    X_mov[:, 1] = X_mov[:, 1] * -1

    # Initial alignment using landmarks
    fix_coords, mov_coords = get_corresponding_landmark_coords(data_fix, data_mov)

    if size(fix_coords, 1) >= 3
        mov_coords[:, 1] = mov_coords[:, 1] * -1
        cm = mean(mov_coords, dims=1)
        cf = mean(fix_coords, dims=1)
        R = compute_rotation(mov_coords, fix_coords)
        X_mov = (X_mov .- cm) * R .+ cf
    end

    # Create moving point cloud
    pcmov = PointCloud(X_mov[:, 1], X_mov[:, 2], X_mov[:, 3])

    # Auto-estimate overlap ratio
    n_fix = size(data_fix.vertices, 1)
    n_mov = size(data_mov.vertices, 1)
    overlap_ratio = clamp(min(n_fix, n_mov) / max(n_fix, n_mov), 0.3, 1.0)

    pcfix.sel = sel_orig

    residual_distances = Any[]

    query_points = [pcfix.x[sel_orig]'; pcfix.y[sel_orig]'; pcfix.z[sel_orig]']

    # ICP iterations
    for i in 1:100
        initial_distances = matching!(pcmov, pcfix, query_points)
        reject!(pcmov, pcfix, 0.3, initial_distances; overlap_ratio=overlap_ratio)

        dH, residuals = estimate_rigid_body_transformation(
            pcfix.x[pcfix.sel], pcfix.y[pcfix.sel], pcfix.z[pcfix.sel],
            pcfix.nx[pcfix.sel], pcfix.ny[pcfix.sel], pcfix.nz[pcfix.sel],
            pcmov.x[pcmov.sel], pcmov.y[pcmov.sel], pcmov.z[pcmov.sel]
        )

        push!(residual_distances, residuals)
        transform!(pcmov, dH)
        pcfix.sel = sel_orig

        if i > 1
            if check_convergence_criteria(residual_distances[i], residual_distances[i-1], 3)
                break
            end
        end
    end

    # Compute per-vertex NN distances (both directions)
    fix_array = hcat(pcfix.x, pcfix.y, pcfix.z)
    mov_array = hcat(pcmov.x, pcmov.y, pcmov.z)

    # fixed→moving distances
    fix_to_mov = idxdst(mov_array', fix_array')  # rows = fix points, col2 = distance
    # moving→fixed distances
    mov_to_fix = idxdst(fix_array', mov_array')  # rows = mov points, col2 = distance

    return Dict(
        "fixedCoords" => vec(fix_array'),
        "movingCoords" => vec(mov_array'),
        "fixedDistances" => fix_to_mov[:, 2],
        "movingDistances" => mov_to_fix[:, 2]
    )
end
