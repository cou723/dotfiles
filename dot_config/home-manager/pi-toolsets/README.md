# Nix で管理する Pi パッケージ

これはこの環境独自の Home Manager 規約で、公式の Pi/Home Manager API ではありません。
Nix は必要な資産を含む完成パッケージを構築します。Home Manager は、そのパッケージが宣言するリソースと実行環境を公開するだけで、ツールセット間の依存グラフを解決・展開しません。

## パッケージの選択

`home-common.nix` で選択します。

```nix
programs.pi = {
  enable = true;
  package = piPackage;
  toolsets = with toolsets; [
    permissions history askUserQuestion context7 yomiyasu explainer nixToolsets todoist subagents gitWorkflow
  ];
};
```

オプション名は従来の `toolsets` のままですが、選ぶ対象は完成した Pi パッケージです。
モジュールは同じパッケージの重複選択を除き、リソースの配置先やパッケージ名の衝突を拒否します。
完成パッケージに組み込み済みの構成要素を、別途選択しないでください。共有する構成要素は一つのパッケージにまとめられます。

## 完成パッケージの構成

`default.nix` から `mk-toolset.nix` を使います。

```nix
example = mkToolset {
  name = "pi-example";
  source = pinnedSource;
  resources.skills = [ "example" ];
  runtimePackages = [ pkgs.python3 ];
  components = [ anotherPiPackage ];
};
```

`components` は Nix の評価・ビルド時に行うパッケージ構成で、別の依存リゾルバではありません。
nixpkgs の `buildEnv` がリソースのディレクトリ構造を合成します。完成パッケージのマニフェスト、公開リソース、実行時パッケージ、未充足条件には、構成要素の情報も含まれます。
構成要素自体も、他の資産を組み込んだパッケージにできます。通常の Nix の参照関係によってビルド依存を接続し、参照先の出力を保持します。循環したビルド依存には対応しません。

ビルダーは Pi 標準の `package.json` と、情報用の `toolset.json` を生成します。
リソースのディレクトリ全体を保持するため、同階層の資産や補助ファイルも残ります。構成要素のマニフェストは合成対象から除き、ファイルの衝突を拒否し、公開パスの存在を確認します。
ソースのリビジョンとハッシュは既存のパッケージ定義と `pi-skills/sources.nix` に記録したままで、ロックファイルは変更していません。

Home Manager モジュールの役割は次のとおりです。

- 完成パッケージの extensions・skills・prompts・themes・agents をリンクする。
  agents は pi-subagents の資産で、Pi 本体の `pi.agents` ではない。
  パッケージ経由でも読めるよう `package.json` の `pi-subagents.agents` に探索ディレクトリを宣言する。
- 実行時パッケージと、それらのコマンドのパスを PATH の先頭に加える `pi` ランチャーを提供する。
- 選択した完成パッケージの一覧を `~/.pi/agent/toolsets.json` に書く。
- 可変設定、認証情報、OAuth 状態、信頼設定、ログは変更しない。

Pi は `toolset.json` を依存仕様として読みません。このグローバル環境で、同じパッケージを Pi の設定や `-e` からも読み込むと、リソースが重複登録されます。
プロジェクト限定の環境では、`-e` で完成パッケージを直接読み込めます。管理 Skill の[追加例](management-skill/skills/pi-nix-toolsets/references/toolsets.md)を参照してください。

## ビルドと検査

```sh
cd ~/.config/home-manager
nix build .#checks.x86_64-linux.pi-toolsets \
  .#checks.x86_64-linux.pi-toolset-module --no-link -L
nix build .#homeConfigurations.coura.activationPackage --no-link -L
# 実環境への適用は、別途明示的に行う。
home-manager switch --flake .#coura
```

- `pi-toolsets` は `linkFarm` でカタログ内の全パッケージをビルドします。定義を追加してもテスト一覧の更新は不要です。これはビルドの確認で、実行時の一連の動作を検査するものではありません。
- `pi-toolset-module` は小さな架空のパッケージを使い、独自の配置処理、ランチャー、選択解除、衝突検出、可変ファイルを管理対象にしないことを検査します。導入する Skills の列挙や固定件数の比較はしません。
- 現在使っている独自拡張の個別検査は維持しています。単純な資産パッケージの追加に専用テストは不要です。独自の変換・実行処理に検査すべき挙動がある場合に追加します。

ビルド成功は、認証、ネットワーク接続、MCP ツールの互換性、Skill の全手順の動作を保証しません。
初回確認は Nix ビルドの外で行います。登録状態を確認し、本人が対話的に認証した後、ユーザーの了承を得て少量の読み取りを行ってください。実アカウントに検査用データを作成しないでください。
適用後は更新されたランチャー経由で Pi を再起動し、PATH を引き継いでください。`/reload` だけでは、起動済みプロセスの環境を置き換えられません。

## 各パッケージの対応範囲

- **gitWorkflow**：個人の Git 方針を持つ Skill と、fresh context で作業する `git-committer` Agent を提供します。親には短い結果だけを返します。同じ作業ツリーで直列実行し、コミットは依頼・許可の範囲のみ。pi-subagents 基盤は別途選択した `subagents` が供給します。登録のみでは実際のコミット動作の確認にはなりません。
- **todoist**：Skill と Pi 標準 MCP の登録拡張を一つの完成パッケージにまとめています。HTTP 接続先の固定はリモート実装の固定ではありません。[Todoist の説明](todoist/README.md)を参照してください。
- **yomiyasu**：固定した Skill と Python を提供します。
- **explainer**：固定した5つのSkills、Node 24、Python、TALA同梱のD2 v0.9.0を提供します。D2は公式アーカイブを版・SHA-256で固定し、LinuxでTALA・SVG・端末テキスト・PNG描画を確認しています。[D2の構成と検査](d2/README.md)を参照してください。文書検査用のプロジェクトJS依存とブラウザ、形式手法ツール、fresh-readerの全手順は別途準備・確認が必要です。
- **context7**：MCP アダプターではなく、固定した Pi ネイティブ拡張を使います。ネットワークと認証は実行時の条件です。
- **subagents**：固定した pi-subagents 0.77.0 と Claude 定義の互換アダプター。子にも既存の権限拡張を必須ロードします。ネイティブ子の fresh 実行は決定論的なテストモデルで検証済みですが、実認証を使う背景・再開・worktree の全手順は別途検証が必要です。[対応範囲と差分](../pi-subagents/README.md)を参照してください。
- **permissions/history/question**：既存の固定済み拡張パッケージを維持しています。

`requirements` は未充足条件の記録であり、検査や依存の供給は行いません。
MCP・Hooks・Agents の実行には、具体的な Pi の実行方式への接続が必要です。秘密情報を Nix の出力や Git に入れないでください。
