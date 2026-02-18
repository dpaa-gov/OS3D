# OS3D Development Entry Point
# For compiled mode, see src/OS3D.jl julia_main()

using OS3D
OS3D.APP_ROOT[] = @__DIR__
OS3D.start_server()
