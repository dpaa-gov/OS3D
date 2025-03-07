## Osteometric Sorting 3D
This is a minimum working example of Osteometric Sorting for 3D data with pre-digitized landmarks and fracture margins for a sample of 426 femora (45,369 comparisons) reduced to 2% of the original models. Also included are non-digitized models in femur/F if the Apollo guys prefer that.

See main.jl

```
using Distributed

addprocs(2)

@everywhere using SharedArrays
@everywhere using NearestNeighbors
@everywhere using Printf
@everywhere using StatsBase
@everywhere using Statistics
@everywhere using MultivariateStats
@everywhere using LinearAlgebra
@everywhere using DelimitedFiles
@everywhere using Dates

include("knn_ind_dst.jl") #knn index + distance
include("point_to_plane.jl") #point to point registration
include("point_to_point.jl") #point to plane registration
include("fragment_landmarks.jl") #calculates distance between comparison while removing fragmentary borders
include("alignment_landmarks.jl") #extracts initial landmarks used to aid registration
include("icp.jl") #main iterative closet point function

filelist1 = readdir("femur/F_digitized/left", join = true)
filelist2 = readdir("femur/F_digitized/right", join = true)

results = OMS(filelist1, filelist2)
```