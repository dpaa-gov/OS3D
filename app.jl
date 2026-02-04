using Genie
using Genie.Router
using Genie.Renderer.Html
using Genie.Renderer.Json
using Genie.Requests
using HTTP
using JSON3

# Include library modules
include("lib/ply_handler.jl")
include("lib/comparison.jl")
include("lib/hole_detection.jl")

# Include routes
include("routes.jl")

# Configure Genie
Genie.config.run_as_server = true
Genie.config.server_port = 8000
Genie.config.cors_headers["Access-Control-Allow-Origin"] = "*"

# Serve static files from public directory
Genie.config.path_build = "public"

# Start server
up(8000, async=false)
