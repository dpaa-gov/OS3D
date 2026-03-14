function compute_rotation(moving_landmarks, fixed_landmarks)
    cm = mean(moving_landmarks, dims=1)
    cf = mean(fixed_landmarks, dims=1)
    N = (fixed_landmarks .- cf)' * (moving_landmarks .- cm)
    sv = svd(N)
    R = sv.V * sv.U'
    return R
end

# Weighted Procrustes — per-point weights for guide landmarks
# weights: N-element vector (1.0 for anatomical, 0.1 for guide landmarks)
function compute_weighted_rotation(moving_landmarks, fixed_landmarks, weights)
    w = weights ./ sum(weights)  # normalize weights
    # Weighted centroids
    cm = sum(w .* moving_landmarks, dims=1)
    cf = sum(w .* fixed_landmarks, dims=1)
    # Weighted cross-covariance
    N = (fixed_landmarks .- cf)' * (Diagonal(vec(w)) * (moving_landmarks .- cm))
    sv = svd(N)
    R = sv.V * sv.U'
    return R, vec(cm), vec(cf)
end
