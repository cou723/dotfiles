{
  description = "Home Manager configuration for macOS and Linux";

  inputs = {
    pi.url = "github:earendil-works/pi/stable";
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

  outputs = { nixpkgs, home-manager, nixpkgs-linux, home-manager-linux, pi, ... }: {
    packages.aarch64-darwin.default = home-manager.packages.aarch64-darwin.home-manager;
    packages.x86_64-linux.default = home-manager-linux.packages.x86_64-linux.home-manager;

    homeConfigurations = {
      "yuki.ueyama" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        extraSpecialArgs = { inherit pi; };
        modules = [ ./home-common.nix ./home-darwin.nix ];
      };
      "coura" = home-manager-linux.lib.homeManagerConfiguration {
        pkgs = nixpkgs-linux.legacyPackages.x86_64-linux;
        extraSpecialArgs = { inherit pi; };
        modules = [ ./home-common.nix ./home-linux.nix ];
      };
    };
  };
}
