{
  description = "Home Manager configuration for macOS and Linux";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixpkgs-linux.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager-linux = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs-linux";
    };
  };

  outputs = { nixpkgs, home-manager, nixpkgs-linux, home-manager-linux, ... }: {
    packages.aarch64-darwin.default = home-manager.packages.aarch64-darwin.home-manager;
    packages.x86_64-linux.default = home-manager-linux.packages.x86_64-linux.home-manager;

    homeConfigurations = {
      "yuki.ueyama" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        modules = [ ./home-common.nix ./home-darwin.nix ];
      };
      "coura" = home-manager-linux.lib.homeManagerConfiguration {
        pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
        modules = [ ./home-common.nix ./home-linux.nix ];
      };
    };
  };
}
