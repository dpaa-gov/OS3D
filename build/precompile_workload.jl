## Precompile workload for PackageCompiler sysimage
## Exercises hot paths so they're AOT-compiled into the sysimage

# === Genie / Web Server packages ===
using Genie
using Genie.Router
using Genie.Renderer.Html
using Genie.Renderer.Json
using Genie.Requests
using HTTP
using JSON3

# JSON round-trip
json_str = JSON3.write(Dict("key" => "value", "num" => 42))
JSON3.read(json_str)

# === ICP / Scientific packages ===
using NearestNeighbors
using StatsBase
using Statistics
using MultivariateStats
using LinearAlgebra
using SharedArrays

# KD-tree operations (hot path in ICP)
pts = rand(3, 500)
tree = KDTree(pts)
knn(tree, pts[:, 1], 10)

# Linear algebra (used in rigid body transforms)
A = rand(6, 6)
b = rand(6)
A \ b

M = rand(4, 4)
inv(M)
det(M)

# Statistics (used in convergence checks and rejection)
data = rand(100)
mean(data)
std(data)
median(data)
mad(data, normalize=true)
quantile(data, 0.95)

# Covariance + eigen (used in normal estimation)
C = cov(rand(3, 10), dims=2)
eigen(C)

# PCA-style operations
fit(PCA, rand(3, 50))

println("Precompilation workload complete")
