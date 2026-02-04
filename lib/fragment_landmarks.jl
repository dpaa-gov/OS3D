# Fragment margin handling for new XYZ format
# Removes boundary vertices from Hausdorff distance calculation

# remove_fragmented_margins(fixed_array, moving_array, fixed_boundary_indices, moving_boundary_indices; percentile=0.95)
# Calculate Hausdorff Distance excluding boundary vertices.
# percentile: The percentile of distances to use (0.95 = 95th percentile, below which 95% of points fall)
@everywhere function remove_fragmented_margins(fixed_array::Matrix, moving_array::Matrix, 
                                                fixed_boundary_indices::Vector{Int}, 
                                                moving_boundary_indices::Vector{Int};
                                                percentile::Float64=0.95)
    # Get KNN distances in both directions
    test1 = idxdst(fixed_array', moving_array')
    test2 = idxdst(moving_array', fixed_array')
    
    # Remove moving boundary points from test1
    if !isempty(moving_boundary_indices)
        keep_rows1 = setdiff(1:size(test1, 1), moving_boundary_indices)
        test1 = test1[keep_rows1, :]
    end
    
    # Remove fixed boundary points from test2
    if !isempty(fixed_boundary_indices)
        keep_rows2 = setdiff(1:size(test2, 1), fixed_boundary_indices)
        test2 = test2[keep_rows2, :]
    end
    
    # Remove correspondences to boundary points
    for idx in fixed_boundary_indices
        test1 = test1[test1[:, 1] .!= idx, :]
    end
    
    for idx in moving_boundary_indices
        test2 = test2[test2[:, 1] .!= idx, :]
    end
    
    # Percentile-based Hausdorff Distance
    if size(test1, 1) == 0 || size(test2, 1) == 0
        return Inf  # No valid points for comparison
    end
    
    # Use quantile (percentile) instead of mean for robustness to outliers
    HDist = max(quantile(test1[:, 2], percentile), quantile(test2[:, 2], percentile))
    return HDist
end