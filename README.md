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
Nix管理のランチャーでは `PI_SKIP_VERSION_CHECK=1` を設定し、Pi本体の新版通知を無効にする。
更新はNix側で行い、モデル一覧の更新やnpm拡張の更新確認は無効にしない。

```sh
ai    # pi
aic   # pi --continue（直前のPiの会話から継続）
aip   # pi --print（非対話実行）
```

Piの設定は `~/.pi/agent/` に置く。共有する設定はchezmoiで管理し、
認証・セッション・ログ・端末固有のIDはGitに保存しない。
undo・質問UI・skillsは `dot_config/home-manager/` のNix設定で
バージョンを固定し、Home Managerから配置する。これらを `pi update --extensions` で更新しない。
OpenAIのサブスクリプションはPiの `/login` からサインインする。
Todoistは `pi mcp login todoist`、GitHub MCPは既存の `gh auth token` を利用する。
既定モデル・ツール・npm拡張一覧はchezmoiで管理する。MCPの認証・個別設定はPi側で管理し、
OpenCodeの設定には依存しない。

生成パッケージ・認証・セッション・ログは管理しない。
OpenCodeの過去セッション・認証データはPiへインポートしない。
`pnpm install` の短縮エイリアスは、Piとの衝突を避けて `pni` とする。

### Pi から Gmail を使う

Gmail は [Google 公式 Gmail MCP toolset](dot_config/home-manager/pi-toolsets/gmail/README.md) を使う。
Pi 標準 MCP から Google のリモートサーバーに接続し、codemode で検索・本文／スレッドの取得、
下書き作成を行う。送信・ラベル変更は公開しない。ローカルの Python サーバーは不要。

現在は Developer Preview Program への参加が前提。初回は本人が Google Cloud の
**Gmail API と Gmail MCP API の両方**を有効にし、Web application の OAuth クライアントを作る。
戻り先は `http://127.0.0.1:8766/callback`、ダウンロードした JSON の保存先は
`~/.config/pi-gmail/client_secret.json`。秘密は Git・chezmoi・Nix store に入れない。
認証は Pi 内の `/mcp login gmail`。OAuth の権限範囲、適用・ロールバック、
初回確認の詳細は上記 README を参照。

### Pi の共有設定

共有設定のソースは `dot_pi/agent/`。NixはPi本体・権限審査・質問UI・undo・skillsを担当し、
chezmoiは書き換え可能な設定とローカル拡張を担当する。Home Managerとの二重管理はしない。

`modify_settings.json` はPython 3のマージスクリプト。主モデルは `openai/gpt-6.1-sol`、
既定ツールは `+codemode`、npm拡張は `@calesennett/pi-codex-fast` とし、共有設定を既存JSONへマージする。
`deviceId`、既読バージョン、MCP設定、その他の端末固有項目は維持する。
`chezmoi add` で `settings.json` を取り込まない。マージスクリプトが置き換わってしまう。

権限審査はHome Manager管理の `pi-permission-system` と `pi-permission-auto-review` を使う。
設定・制限・検証方法は [権限審査のREADME](dot_config/home-manager/pi-permission-auto-review/README.md) を参照。
試行錯誤で使った旧 `pi-verdict` 方式は廃止し、マージ時に旧 `permissionGate` 設定を削除する。
`.chezmoiremove` では旧Luna接続拡張と旧 `permission-review` を削除する。現行の審査拡張は削除しない。
実験用のOS sandboxも撤去済み。現行の権限審査はOS sandboxによる隔離を提供しない。
認証・セッション・過去の審査ログは削除せず、引き続きGit・chezmoiの対象外とする。
拡張の変更を反映するには、適用後にPiを再起動する。

設定のオフライン検証:

```sh
python3 .github/tests/test-pi-config.py
```

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
| `dot_pi/agent/modify_settings.json` | `~/.pi/agent/settings.json` の共有項目のみマージ |
| `.chezmoiremove` | 廃止済みファイル・ディレクトリの削除 |
