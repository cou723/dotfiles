{ pkgs }:
{
  yomiyasu = pkgs.fetchzip {
    extension = "tar.gz";
    url = "https://codeload.github.com/nanaism/yomiyasu/tar.gz/373356eb874af5184962c88e925ea7eb58450318";
    hash = "sha256-UrScbstVNRPTu7mWPvR11xBgmR057PVUYouSyFv3/+k=";
  };
  explainer = pkgs.fetchzip {
    extension = "tar.gz";
    url = "https://codeload.github.com/mizchi/explainer/tar.gz/578defba7249fde5366689424ed6017f76b5598b";
    hash = "sha256-X28LASU60zC8Q/8asgAr2UWIMxjYsVPEvd/bTro3c4o=";
  };
}
