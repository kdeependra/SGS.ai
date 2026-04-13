using Pkg
using Tar

# Set the project directory
project_dir = joinpath(@__DIR__, "backend", "HllSets")

# Activate the project
Pkg.activate(project_dir)

# Ensure the dist directory exists
dist_dir = joinpath(project_dir, "dist")
mkpath(dist_dir)

# Temporarily rename the dist directory to exclude it from the tarball
temp_dist_dir = joinpath(project_dir, "dist_temp")
if ispath(dist_dir)
    mv(dist_dir, temp_dist_dir)
end

try
    # Create a tarball of the project
    tarball_path = joinpath(temp_dist_dir, "HllSets.tar.gz")
    Tar.create(project_dir, tarball_path)  # Corrected argument order
    println("Package built successfully at: ", tarball_path)

    # Restore the dist directory before moving the tarball
    # if ispath(temp_dist_dir)
    mv(temp_dist_dir, dist_dir)
    println("Tarball moved to 'dist_dir': ", dist_dir)
    # else
    # Move the tarball to the dist directory
    # final_tarball_path = joinpath(dist_dir, "HllSets.tar.gz")
    # mv(tarball_path, final_tarball_path)
    # println("Tarball moved to 'final_tarball_path': ", final_tarball_path)
    # end
    
finally
    # Ensure the dist directory is restored even if an error occurs
    if ispath(temp_dist_dir)
        mv(temp_dist_dir, dist_dir)
        println("Restored 'dist_dir': ", dist_dir)
    end
end