fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Only regenerate if proto files change
    println!("cargo:rerun-if-changed=../../proto/confidence.proto");
    println!("cargo:rerun-if-changed=../../proto/coordinator.proto");
    println!("cargo:rerun-if-changed=../../proto/patterns.proto");
    println!("cargo:rerun-if-changed=../../proto/registry.proto");

    tonic_build::configure()
        .out_dir("generated")
        .compile_protos(
            &[
                "../../proto/confidence.proto",
                "../../proto/coordinator.proto",
                "../../proto/patterns.proto",
                "../../proto/registry.proto",
            ],
            &["../../proto"],
        )?;
    Ok(())
}