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

### Pi の共有設定

共有設定のソースは `dot_pi/agent/`。NixはPi本体・質問UI・undo・skillsを担当し、
chezmoiは書き換え可能なJSON設定を担当する。Home Managerとの二重管理はしない。

- `modify_settings.json` はPython 3のmodifyスクリプト。既定モデル・ツール・npm拡張一覧だけを
  既存の `settings.json` にマージする。`deviceId`・変更履歴の既読バージョン・その他の
  ローカル設定は維持する。新しい端末では端末固有の項目をコピーしない。
- npm拡張は `pi-verdict@0.15.0` に固定する。旧 `pi-permission-system` と
  `pi-permission-classifier` はロードしない。
- `config/pi-verdict.json` は権限ルールを保存する。秘密情報の固定保護と内蔵の拒否ルールを
  有効にし、通常の操作は直近のユーザー発言とツール操作履歴を使って審査する。
- `extensions/20-permission-luna-chat.ts` は `permission-chat/luna` を登録する。
  チャット版 `openai/gpt-6-luna` にのみ委譲し、既存のOpenAI OAuth認証をPi経由で利用する。
  同じIDのDecisions APIを選ばないための補助拡張であり、認証ファイルを読んだり
  トークンをコピーしたりしない。主作業モデルはSolのまま。
  分類器には判定理由を日本語で書くよう指定する。判定タグとallow/ask/denyは変更せず、
  元の判定プロンプト・ユーザー依頼は保持する（固定ルールの理由・UI見出しは英語のまま）。
  明示的に依頼された通常のディレクトリ調査とPi設定変更は、作業ディレクトリ外という
  理由だけで確認しないよう指示する。実行コードの導入・外部サービス変更などの影響は別途評価する。
  認証・秘密情報と、権限ゲート・分類器自身の設定やコードは引き続き保護する。
  固定ルールの拒否・denyPathsによる確認は追加指示で解除しない。
  適用済みの補助拡張もdenyルールで保護するため、変更・適用はPiの外で行う。
- Lunaの思考はoff、リクエスト予算は1試行15秒。pi-verdictの再試行で最大2試行になる。
  失敗・不正な応答は拒否する。外部への書き込みなどではAIが確認を求めることがある。
- `codemodeNestedCalls: "gate"` によりcodemode内の呼び出しも審査する。
  外側のcodemodeだけを `ignoreTools` に入れ、二重のスクリプト審査を避ける。
- 判定ログは `~/.pi/agent/verdicts/` に保存し、chezmoiとGitの対象外とする。

適用にはPython 3が必要（Home Managerの共通パッケージに含まれる）。
Pi設定だけを確認・反映する場合は、次のように対象を限定する。
認証ファイルや1Passwordの値を取り込む必要はない。

```sh
chezmoi diff ~/.pi/agent/settings.json \
  ~/.pi/agent/config/pi-verdict.json \
  ~/.pi/agent/extensions/20-permission-luna-chat.ts
chezmoi apply ~/.pi/agent/settings.json \
  ~/.pi/agent/config/pi-verdict.json \
  ~/.pi/agent/extensions/20-permission-luna-chat.ts
```

適用後はPiで `/reload`、または再起動する。
`settings.json` の共有項目を変えるときは `modify_settings.json` の設定値を編集する。
`chezmoi add ~/.pi/agent/settings.json` は使わない（modifyスクリプトを置き換えてしまう）。
権限ルールは **Piの外のエディタで** `config/pi-verdict.json` を変更し、
`chezmoi add ~/.pi/agent/config/pi-verdict.json` で取り込む。
pi-verdictは自身の設定・インストール済みコードへのエージェントからの変更を拒否する。
chezmoi applyや拡張更新はPiの外で、Piを終了してから行うのが安全。
`~/.pi/agent/` 全体の再帰的な取り込みは避ける。

検証はリポジトリ内で次を実行する。どちらもモデルAPIへの通信や秘密情報の取得はしない。

```sh
python3 .github/tests/test-pi-config.py
pi --offline --no-session --no-mcp --no-skills --print \
  -e .github/tests/test-permission-luna-chat.ts /test-permission-luna-chat
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
| `dot_pi/agent/config/pi-verdict.json` | 権限ルールと判定モデル |
| `dot_pi/agent/extensions/20-permission-luna-chat.ts` | チャット版Lunaの判定用別名 |
