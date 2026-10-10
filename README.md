# dotfiles

chezmoi で管理する個人 dotfiles。

## セットアップ

```sh
chezmoi init --apply https://github.com/cou723/dotfiles.git
```

### macOS / Linux の Nix / Home Manager

macOS / Linux 用のパッケージ構成は `~/.config/home-manager` に配置される。
chezmoiはファイルの配置を担当し、環境の選択はNixの `flake.nix` で行う。
`home-common.nix` に共通設定、`home-linux.nix` / `home-darwin.nix` に
OS別パッケージ・ユーザー名・ホームディレクトリを定義する。
Linuxは `coura`（x86_64）、macOSは `yuki.ueyama`（Apple Silicon）の構成を用意し、
macOSでは `colima` など、Linuxでは `strace`・`pnpm`・`ripgrep` などをインストールする。
LinuxのNixユーザー設定 `~/.config/nix/nix.conf` もchezmoiで管理する。
Nix をインストールした後、次のコマンドで固定済みの構成を反映する。

```sh
PATH=/nix/var/nix/profiles/default/bin:$PATH \
  nix run ~/.config/home-manager -- switch --flake ~/.config/home-manager
```

`flake.lock` は両OSの依存関係を固定する。macOSは `nixpkgs` / `home-manager`、
Linuxは `nixpkgs-linux` / `home-manager-linux` の入力を使い、既存のバージョンを
それぞれ維持する。依存関係の更新時は適用先の `flake.lock` をchezmoiへ取り込む。
macOS / Linux 以外ではこのディレクトリは適用されない。

Linux構成の管理元はこのリポジトリの `dot_config/home-manager/` とし、
`cou723/cou723` リポジトリの構成ではなく `~/.config/home-manager` を指定して切り替える。

### 1Password CLI のインストール

シークレットは 1Password CLI (`op`) 経由で取得される。インストール後、`chezmoi apply` を再実行すること。

```sh
# macOS / Linux ネイティブ
brew install 1password-cli

# WSL の場合
# Windows 側に 1Password をインストールし、デスクトップアプリの
# 設定 → デベロッパー →「1Password CLI との統合を使用する」をON にすると
# op.exe が使えるようになる。
# このリポジトリには op.exe へのラッパー (~/.local/bin/executable_op) が含まれているため
# chezmoi init --apply 後はそのまま使える。
```

### シークレットの反映

`op` のインストールと 1Password へのアイテム登録が済んだら:

```sh
chezmoi apply
```

`~/.secrets` が自動生成され、シェル起動時に読み込まれる。

## 日常の使い方

### dotfiles を編集する

chezmoi のソースを直接編集して apply するのが基本。

```sh
chezmoi edit ~/.zshrc    # エディタでソースを開く
chezmoi apply            # 適用
```

または `~/.local/share/chezmoi/` 以下を直接編集して `chezmoi apply`。

### 変更をコミット・プッシュ

```sh
cd ~/.local/share/chezmoi
git add -A && git commit -m "..."
git push
```

### 別マシンに同期

```sh
chezmoi update    # git pull + apply を一発で実行
```

### Pi を起動する

Pi は `github:earendil-works/pi/stable` の default パッケージを Home Manager で
macOS / Linux 共通にインストールする。`nix profile add` は不要で、上記の
Home Manager の切り替えコマンドで反映する。バージョンは `flake.lock` で固定する。

```sh
ai    # pi
aic   # pi --continue（直前のPiの会話から継続）
aip   # pi --print（非対話実行）
```

Piの可変設定・認証・セッションは `~/.pi/agent/` に置き、Gitには保存しない。
undo・質問UI・skills・sub-agent拡張は `dot_config/home-manager/` のNix設定で
バージョンを固定し、Home Managerから配置する。これらを `pi update --extensions` で更新しない。
OpenAIのサブスクリプションはPiの `/login` からサインインする。
Todoistは `pi mcp login todoist`、GitHub MCPは既存の `gh auth token` を利用する。
モデル・MCPの可変設定はPi側で管理し、OpenCodeの設定には依存しない。

Linuxのsub-agentは `/defined-agents` で一覧を確認できる。実行可能な `researcher` と、
無効の `git-commit` たたき台を用意している。定義の原本は `dot_pi/agent/agents/` で管理し、
chezmoiから `~/.pi/agent/agents/` へ直接配置する。定義編集はapplyとPiの `/reload` だけで反映でき、
Nixビルドは不要。生成パッケージ・認証・セッション・ログは管理しない。
定義必須・tmp書き込み限定のbubblewrap構成、
検証コマンド、制約は [pi-defined-subagents/README.md](dot_config/home-manager/pi-defined-subagents/README.md) を参照する。
OpenCodeの過去セッション・認証データはPiへインポートしない。
`pnpm install` の短縮エイリアスは、Piとの衝突を避けて `pni` とする。

## シークレットの扱い

| ファイル | 管理方法 | 備考 |
|---------|---------|------|
| `~/.secrets` | chezmoi template が生成 | git 管理外。`op` で値を取得 |

**シークレットを追加するとき:**

1. 1Password にアイテムを作成
2. `dot_secrets.tmpl` に `{{ onepasswordRead "op://..." }}` で参照を追加
3. `chezmoi apply`

**生の値を dotfiles に直接書かない。**

## 構成ファイル

| ソースファイル | 適用先 |
|--------------|--------|
| `dot_zshrc` | `~/.zshrc` |
| `dot_profile` | `~/.profile` |
| `dot_gitconfig.tmpl` | `~/.gitconfig` |
| `dot_p10k.zsh` | `~/.p10k.zsh` |
| `dot_secrets.tmpl` | `~/.secrets` |
| `dot_local/bin/executable_op` | `~/.local/bin/executable_op` (WSL 用 op.exe ラッパー) |
| `dot_config/home-manager/` | `~/.config/home-manager/` (macOS / Linux) |
| `dot_config/nix/nix.conf` | `~/.config/nix/nix.conf` (Linuxのみ) |
