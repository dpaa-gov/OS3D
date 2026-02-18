function compute_rotation(moving_landmarks, fixed_landmarks)
    cm = mean(moving_landmarks, dims=1)
    cf = mean(fixed_landmarks, dims=1)
    N = (fixed_landmarks .- cf)' * (moving_landmarks .- cm)
    sv = svd(N)
    R = sv.V * sv.U'
    return R
end
