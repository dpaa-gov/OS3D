# ICP Server - Standalone distributed comparison server
# Runs separately from Genie app, communicates via HTTP API

using Distributed

# Add workers: N-2 (1 for this server, 1 left open), capped at 64 to prevent
# memory bandwidth saturation and NUMA effects on high-core-count systems
n_workers = min(max(1, Sys.CPU_THREADS - 2), 64)

# Use sysimage for workers if available (dramatically faster startup)
project_dir = dirname(@__DIR__)
sysimage_ext = Sys.iswindows() ? "dll" : Sys.isapple() ? "dylib" : "so"
sysimage_path = joinpath(project_dir, "dist", "os3d_sysimage.$sysimage_ext")

if isfile(sysimage_path)
    @info "Using sysimage for workers: $sysimage_path"
    addprocs(n_workers, exeflags=["--project=$project_dir", "-J$sysimage_path"])
else
    @info "No sysimage found — workers will use JIT compilation"
    addprocs(n_workers, exeflags=["--project=$project_dir"])
end

# Load packages on workers
@everywhere using SharedArrays
@everywhere using NearestNeighbors
@everywhere using StatsBase
@everywhere using Statistics
@everywhere using MultivariateStats
@everywhere using LinearAlgebra

# Load ICP code
include(joinpath(@__DIR__, "icp.jl"))
@info "ICP code loaded on $(nworkers()) workers"

# Now load HTTP for the API server (main process only)
using HTTP
using JSON3

const ICP_PORT = 8001
running_comparison = Ref(false)

function handle_compare(req::HTTP.Request)
    try
        data = JSON3.read(String(req.body))
        left_files = convert(Vector{String}, data.leftFiles)
        right_files = convert(Vector{String}, data.rightFiles)
        percentage = Float64(get(data, :percentage, 0.95))
        
        running_comparison[] = true
        @info "Starting comparison: $(length(left_files)) × $(length(right_files))"
        
        # Run distributed OMS
        raw_results = OMS(left_files, right_files, percentage)
        
        running_comparison[] = false
        
        # Format results
        results = []
        for i in 1:size(raw_results, 1)
            push!(results, Dict(
                "leftFile" => basename(left_files[Int(raw_results[i, 1])]),
                "rightFile" => basename(right_files[Int(raw_results[i, 2])]),
                "distance" => round(raw_results[i, 3], digits=4)
            ))
        end
        
        @info "Completed $(length(results)) comparisons"
        return HTTP.Response(200, ["Content-Type" => "application/json"], 
            body=JSON3.write(Dict("success" => true, "results" => results)))
    catch e
        running_comparison[] = false
        @error "Comparison error: $e"
        return HTTP.Response(500, ["Content-Type" => "application/json"],
            body=JSON3.write(Dict("error" => string(e))))
    end
end

function handle_status(req::HTTP.Request)
    return HTTP.Response(200, ["Content-Type" => "application/json"],
        body=JSON3.write(Dict(
            "ready" => true,
            "workers" => nworkers(),
            "running" => running_comparison[]
        )))
end

function handle_stop(req::HTTP.Request)
    running_comparison[] = false
    @info "ICP server received stop signal — shutting down..."
    # Schedule exit after response is sent
    @async begin
        sleep(1)
        ccall(:exit, Cvoid, (Cint,), 0)
    end
    return HTTP.Response(200, ["Content-Type" => "application/json"],
        body=JSON3.write(Dict("stopped" => true)))
end

function router(req::HTTP.Request)
    if req.method == "GET" && req.target == "/status"
        return handle_status(req)
    elseif req.method == "POST" && req.target == "/compare"
        return handle_compare(req)
    elseif req.method == "POST" && req.target == "/stop"
        return handle_stop(req)
    else
        return HTTP.Response(404, body="Not found")
    end
end

# Start server
@info "ICP Server starting on port $ICP_PORT with $(nworkers()) workers"
HTTP.serve(router, "127.0.0.1", ICP_PORT)
