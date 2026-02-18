# Fragment margin handling for new XYZ format
# Removes boundary vertices from Hausdorff distance calculation

# remove_fragmented_margins(fixed_array, moving_array, fixed_boundary_indices, moving_boundary_indices; percentile=0.95)
# Calculate Hausdorff Distance excluding boundary vertices.
# percentile: The percentile of distances to use (0.95 = 95th percentile, below which 95% of points fall)
function remove_fragmented_margins(fixed_array::Matrix, moving_array::Matrix, 
                                                fixed_boundary_indices::Vector{Int}, 
                                                moving_boundary_indices::Vector{Int};
                                                percentile::Float64=0.95)
    # Get KNN distances in both directions
    test1 = idxdst(fixed_array', moving_array')
    test2 = idxdst(moving_array', fixed_array')
    
    # test1: rows = moving points, col 1 = nearest fixed index
    # Exclude moving boundary points as sources, fixed boundary points as targets
    mov_boundary_set = Set(moving_boundary_indices)
    fix_boundary_set = Set(fixed_boundary_indices)
    
    if !isempty(moving_boundary_indices) || !isempty(fixed_boundary_indices)
        keep1 = [!(i in mov_boundary_set) && !(Int(test1[i, 1]) in fix_boundary_set) for i in 1:size(test1, 1)]
        test1 = test1[keep1, :]
    end
    
    # test2: rows = fixed points, col 1 = nearest moving index
    # Exclude fixed boundary points as sources, moving boundary points as targets
    if !isempty(fixed_boundary_indices) || !isempty(moving_boundary_indices)
        keep2 = [!(i in fix_boundary_set) && !(Int(test2[i, 1]) in mov_boundary_set) for i in 1:size(test2, 1)]
        test2 = test2[keep2, :]
    end
    
    # Percentile-based Hausdorff Distance
    if size(test1, 1) == 0 || size(test2, 1) == 0
        return Inf  # No valid points for comparison
    end
    
    # Use quantile (percentile) instead of mean for robustness to outliers
    HDist = max(quantile(test1[:, 2], percentile), quantile(test2[:, 2], percentile))
    return HDist
end