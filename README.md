# dotfiles

chezmoi で管理する個人 dotfiles。

## セットアップ

```sh
chezmoi init --apply https://github.com/cou723/dotfiles.git
```

### 1Password CLI のインストール

シークレットは 1Password CLI (`op`) 経由で取得される。インストール後、`chezmoi apply` を再実行すること。

```sh
# macOS
brew install 1password-cli
# Linux
# https://developer.1password.com/docs/cli/get-started/
```

### 1Password アイテムの作成

| Vault | Item 名 | フィールド | 用途 |
|-------|---------|-----------|------|
| Personal | Brave Search API | password | Brave Search MCP サーバー |

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

## シークレットの扱い

| ファイル | 管理方法 | 備考 |
|---------|---------|------|
| `~/.secrets` | chezmoi template が生成 | git 管理外。`op` で値を取得 |
| `~/.claude/settings.json` | chezmoi template | `BRAVE_API_KEY` は `$BRAVE_API_KEY` 経由 |

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
| `dot_claude/settings.json.tmpl` | `~/.claude/settings.json` |
| `dot_secrets.tmpl` | `~/.secrets` |
