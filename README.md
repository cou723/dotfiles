# dotfiles

chezmoi で管理する個人 dotfiles。

## セットアップ

```sh
chezmoi init --apply https://github.com/cou723/dotfiles.git
```

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

### OpenCode を起動する

```sh
ai    # opencode mini（最小 UI）
aic   # opencode mini --continue（直前の会話から継続）
```

GitHub MCP を使う場合、`GITHUB_PERSONAL_ACCESS_TOKEN` は `gh auth token` の結果が `~/.zshrc` から自動エクスポートされるため、別途設定しなくてよい。

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
