{
  description = "Interprets download file name and organizes";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable-small";

    flake-utils.url = "github:numtide/flake-utils";

    agenix-shell = {
      url = "github:aciceri/agenix-shell";

      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      agenix-shell,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        installSecrets = agenix-shell.packages.${system}.installationScript.override {
          agenixShellConfig.secrets = {
            env = {
              file = ./secrets/env.age;
              path = ".env.local";
              mode = "0600";
            };
          };
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            deno
          ];

          NODE_ENV = "development";

          shellHook = # bash
            ''
              source ${pkgs.lib.getExe installSecrets}
            '';
        };
      }
    );
}
