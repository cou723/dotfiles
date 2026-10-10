# 定義必須のsub-agent最小構成

Linux / Pi 1.1.0用。`@agwab/pi-subagent` 0.6.4のheadless runnerを再利用し、
定義を必須にするフロントエンドと、Nix固定のbubblewrap境界を追加した小さな派生構成。
上流の汎用拡張・汎用APIはPiへ登録しない。

## 使い方

新しいPiセッション、または `/reload` 後に `/defined-agents` で一覧を確認する。
親からの呼び出しは次の2項目だけ。

```json
{"agent":"researcher","task":"指定したリポジトリを調べ、結論と根拠だけ短く返してください"}
```

| 定義 | 状態 | 用途 |
|---|---|---|
| `~/.pi/agent/agents/researcher.md` | 実行可能 | 調査・検証。編集や実験は新規tmp作業領域だけ |
| `~/.pi/agent/agents/git-commit.md` | 無効のたたき台 | Git手順と許可範囲を決めるための下書き。呼び出しは拒否 |

未知・省略された定義、空の依頼、実行ポリシーの追加引数はエラーになる。
`git-commit` は `enabled` だけを変更しても有効にできない。
リポジトリ書き込み用のポリシーコンパイラはまだ実装していない。

## 固定される条件

インストールと設定を分ける。Nixは拡張コード・Pi・bubblewrapを固定し、
定義の実体はdotfilesリポジトリの `pi/agents/*.md` に置く。
Home Managerの `mkOutOfStoreSymlink` で `~/.pi/agent/agents/` をそのディレクトリへリンクする。
定義の内容はNixパッケージに含めず、chezmoiの配置対象からも外す。
`pi install` の生成パッケージ、認証、セッション、ログはGitへ取り込まない。

```text
~/.pi/agent/agents/
  → ~/.local/share/chezmoi/pi/agents/  （Git管理する実体）
```

リンクはNix store内の中継symlinkを経由するが、実体はcheckout内の通常ファイル。
どちらのパスから編集・追加・削除しても同じ実体が変わり、dotfilesのGit差分に出る。
設定内容の履歴／巻き戻しはGitで管理し、Home Managerの世代はリンクと実行環境を管理する。
checkoutを移動する場合は `home-common.nix` のリンク先を変更して一度反映する。

拡張はグローバル定義だけを起動時／reload時に読み、実行条件を不変のsnapshotにする。
`PI_CODING_AGENT_DIR` を指定した親では、その配下の `agents/` を使う。
プロジェクト定義や同梱のdefaultへfallbackしない。ディレクトリがない・空・不正な定義を含む場合は、
sub-agent拡張の読み込みを拒否する。定義ファイルの名前とfrontmatterの `name` は一致させる。
ファイル名は英小文字で始まり、英小文字・数字・`-`・`_` の64文字以内とする。
定義ディレクトリのsymlinkは使用できるが、個々のMarkdownファイルのsymlinkは受け付けない。

定義の編集・追加にはNixの再ビルドもchezmoi applyも不要。
普段のエディタで `~/.pi/agent/agents/researcher.md` を編集し、Piで `/reload` するだけで反映できる。
変更の保存はdotfilesで `git diff -- pi/agents` を確認してコミットする。
既に読み込んだsnapshotはファイル編集だけでは変わらない。新しいsandbox方式など、
コンパイラがまだ対応していない実行条件を追加する場合は、拡張コードの更新が必要。
子からの定義書き込みは、定義ディレクトリが作業用tmpの外にあるためsandboxで拒否する。

- 呼び出し側が指定できるのは `agent` と `task` のみ。
- 定義がrole prompt、tools、作業領域、sandbox、モデル選択方法、時間制限、結果上限を指定。
- モデルは定義の `model: parent` に従い、呼び出し時の親モデルを使う。
- `researcher` は3分で終了、親へ返す要約は最大6000文字＋短い状態・保存先情報。
- 同じPiプロセスでは同時に1件。同期実行のみ。background／resume／tmux／workflow APIは登録しない。
- 子はextensions・skills・context files・session保存を無効化。sub-agent拡張も読み込まない。
  bashで起動する通常の子プロセスも同じOS sandbox内で動く。

作業領域と記録は次のように分ける。

```text
~/tmp/pi-defined-subagents/job-XXXXXX/  （親が作成、子からはread-only）
  work/                              （子が書き込める唯一のホスト領域）
    .runtime/                        （HOME・tmp・認証／モデル設定の一時コピー）
  artifacts/                         （親がstdout・stderr・tool calls・結果を保存）
```

`.runtime` は成功・失敗・キャンセル後に削除する。親のsettings・extensions・sessionsはコピーしない。
親の認証ファイルは読み取り専用で参照し、そのコピーを子の起動に使う。
子によるOAuth更新は親へ書き戻さない。長時間後の認証失敗は、親側で更新して再実行する。
環境変数だけのAPIキー認証は現在引き継がない。`auth.json` のシェルコマンド参照も、
隔離されたHOME／環境では動かない場合がある。拡張が登録したcustom providerも自動移植しない。

記録は親のコンテキストへ自動投入しない。必要なときだけ、返された保存先を親が読む。
子は `artifacts/` を書き換えられないため、終了前に出力先をsymlinkへ置換し、
親側の結果保存をsandbox外へ誘導することも防ぐ。
記録／実験ファイルは自動削除しないので、不要になったjobディレクトリは手動で削除する。
親プロセス自体が強制終了した場合はfinally処理が走らず、一時認証コピーも残り得る。

## sandboxの範囲と限界

Linuxのbubblewrapを絶対パスで起動し、ホスト全体をread-onlyにした上で `work/` だけを
read-writeでbindする。PID・IPC・UTS・user namespace、別の `/dev` と `/proc`、
capability削除、追加user namespaceの禁止を使う。`/tmp` 全体への書き込みは許可しない。
sandbox起動に失敗したら実行を止める。通常実行へのフォールバックはない。
macOSにはこの拡張を配置しない。

**これはローカルファイルの書き込み境界であり、秘密情報やネットワークの隔離ではない。**
`researcher` のネットワークは無制限で、ホストのファイルは広く読み取り可能。
ローカルサービスへの接続や外部サービス上の変更を禁止する境界でもない。
認証情報を含むファイルを読む／外へ送ることをOSで防ぐ設計ではないため、信頼できないコードの
秘密隔離や、悪意あるworkerの封じ込めにこの構成だけを使わないこと。
CPU・メモリ・ディスクのquota、厳密なモデルturn／cost上限も未実装。

今回の実装は上流の `src/runners/headless-model.ts` を直接使用し、
`src/sandbox/srt.ts` を `sandbox.ts` で置換している。非公開内部インターフェースに依存するため、
バージョン更新時は以下のテストを再実行する。上流のUI・汎用orchestrator・SRT依存は使用しない。
`proper-lockfile`・YAML・TypeBox・Piのpeer dependenciesは、flake固定のホストPiから供給する。

## 再ビルド・検証・反映

```sh
# 実行環境やリンク先を更新するときだけ必要。定義編集には不要。
# Home Manager設定の配置には引き続きchezmoiを使用する。
chezmoi apply ~/.config/home-manager

nix build path:$HOME/.config/home-manager#pi-defined-subagents --no-link
nix build path:$HOME/.config/home-manager#checks.x86_64-linux.pi-defined-subagents --no-link

# Nixのビルドsandbox内ではnamespace作成の実機テストを行わない。
# 次はホスト上のbubblewrapテスト。モデル通信・認証情報は使用しない。
ROOT=$(nix build path:$HOME/.config/home-manager#pi-defined-subagents --no-link --print-out-paths)
# PI_PACKAGE_DIRはPiパッケージのlib/piを指定する。固定済みPiの出力を取得する。
PI=$(nix eval --raw --expr '(builtins.getFlake ("path:" + builtins.getEnv "HOME" + "/.config/home-manager")).inputs.pi.packages.x86_64-linux.default.outPath' --impure)
PI_PACKAGE_DIR="$PI/lib/pi" SUBAGENT_ROOT="$ROOT" RUN_SANDBOX_TESTS=1 \
  node ~/.config/home-manager/pi-defined-subagents/smoke-test.mjs

nix run path:$HOME/.config/home-manager -- switch --flake path:$HOME/.config/home-manager#coura
```

`live-smoke-test.mjs` は明示的な `RUN_LIVE_MODEL=1` が必要で、
親settingsの既定モデルに実リクエストを1回送る。Nixチェックには含めない。
同じ `PI_PACKAGE_DIR` / `SUBAGENT_ROOT` を指定して実行できる。

## 確認した範囲

- 実際のPi loaderで登録でき、登録toolは `subagent` だけ。
- runtimeパッケージに定義がないこと、グローバル定義の不足・不正・個別ファイルsymlinkを拒否することを確認。
- ディレクトリsymlink経由の読み込み・編集・追加・atomic saveと、両方のパスへの子からの書き込み拒否を確認。
- グローバル定義の編集・追加をreloadだけで反映でき、既存snapshotは変わらないことを確認。
- 定義未指定・未知・無効のGit定義・不正YAML・未対応ポリシー・各種上書きを拒否。
- 実bubblewrap上で内部書き込みを許可し、外部・symlink・親認証・グローバル定義・親の記録への書き込みを拒否。
- 実Pi 1.1.0がsandbox内で起動。
- 全tool経路のfixtureで固定argv、プロジェクト定義の無視、要約上限、runtime削除、同時実行拒否、キャンセルを確認。
- agwab runnerのJSON処理・結果保存・timeout、sandbox backend不在時のfail-closedを確認。
- 本番登録tool経由で `openai/gpt-6.1-sol` に1回だけ接続し、期待した短い返答とruntime削除を確認。

他のprovider、OAuthの期限切れ後の挙動、macOS、Git操作、長時間運用は未検証。
候補比較の原本は `../pi-subagent-research-v2.md`。調査要約と実装判断は追加コミットの本文にも残す。
`test-fixtures/agents/` はofflineテスト用のサンプルで、グローバル定義の原本でもruntime同梱定義でもない。
