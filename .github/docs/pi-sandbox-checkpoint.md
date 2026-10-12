# Pi サンドボックス移行前の構成

このコミットには、ローカルの pi-perm UI と設定を保存している。
Nix 設定は `dot_config/home-manager/` で管理され、配置済みの `~/.config/home-manager/` と一致している。
Linux の bubblewrap・socat・ripgrep、Pi 本体と Node.js の指定も同ディレクトリに含む。
Nix 設定の最後の変更は b4a0a0d。flake.lock は変更していない。

## 保存したもの

- `dot_pi/agent/extensions/pi-perm-ui/`：ソース、依存の固定ファイル、修正スクリプト、テスト、README。
- `dot_pi/agent/extensions/pi-perm/config.toml`：ユーザーのプロファイル設定。

node_modules、認証、セッション履歴、監査ログ、一時的な実行状態は保存していない。
別作業の permission-review 関連の未コミット差分もこのコミットの対象外。
移行直前、ユーザーは pi-perm 拡張を無効にした。実行中の有効・無効状態はファイルから再現しない。

## 復元手順

後の移行で変更したファイルだけを、このコミットから管理元へ復元する。
移行時に追加した拡張や設定は別途無効にし、複数の権限制御拡張を同時に起動しないこと。

```bash
# CHECKPOINT はこの文書を最初に追加したコミットのハッシュ。
git restore --source=CHECKPOINT -- dot_pi/agent/extensions/pi-perm-ui dot_pi/agent/extensions/pi-perm
chezmoi apply ~/.pi/agent/extensions/pi-perm-ui ~/.pi/agent/extensions/pi-perm/config.toml
cd ~/.pi/agent/extensions/pi-perm-ui
npm ci --ignore-scripts --legacy-peer-deps
node patch-upstream.mjs
npm test
```

## 既知の問題

README に記録した制限と依存ライブラリのセキュリティ警告が残る。
`:danger-full-access` は network.allowedDomains の `*` を Sandbox Runtime が拒否するため、Bash が実行できない。
この問題への追加修正は行っていない。保存した構成が安全に利用できることを保証するコミットではない。
