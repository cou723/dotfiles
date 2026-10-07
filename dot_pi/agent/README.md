# pi環境：認可・メモリ・作業フロー

このディレクトリは、個人用のpi設定をchezmoiで管理するためのものです。共通の拡張コードは別リポジトリにあります。

## まず全体像

**通常の許可ルール、LLM分類器、独立Resource Gate、OS sandboxは、それぞれ別の役割です。**

| 部品 | 役割 | 動く条件 |
| --- | --- | --- |
| `pi-permission-system` | コマンド・path・toolなどを固定ルールで `allow` / `ask` / `deny` に分類する | 通常の認可処理 |
| authorizer chain | 固定ルールが `ask` にした要求を、登録された判断役へ渡す | `ask` のときだけ |
| `bash-classifier` | bashのaskをLLMで審査する | chainに到達したbash要求だけ |
| 独立Resource Gate | 保護されたコード・共有成果物・削除対象・MCP操作などを実行前に検査する | 通常ルールの `allow` / `ask` によらない `tool_call` 検査 |
| bash / LSP sandbox | subprocessの書き込み先・network・credentialへのアクセスを制限する | 対象のsubprocessを実行するとき |

責務を示す図です。イベントハンドラの厳密な実行順を表すものではありません。

```text
要求されたtool call
  │
  ├─ 通常のpermission判定
  │    ├─ deny  → 拒否
  │    ├─ allow → この判定は通過
  │    └─ ask   → authorizer chain → 必要なら人間確認
  │
  ├─ 独立Resource Gateの実行前検査
  │    ├─ 保護コード・共有ファイル・削除対象の検査
  │    └─ MCPのgrant / サービス事実 / 宛先・本文の確認
  │
  └─ 必要な検査をすべて通過した場合だけ実行
       └─ bash / 設定済みLSP subprocessにはさらにsandbox
```

先行する処理が拒否した要求は、後続の検査まで到達しないことがあります。重要なのは、**通常ルールやLLMの `allow` だけでは、独立Gateの拒否や必須承認を解除できない**ことです。

### `resource-tool-gate` と独立Resource Gateは別の役割

名前が似ていますが、前者は後者への連携口です。

```json
"authorizerChain": ["resource-tool-gate", "bash-classifier"]
```

- `resource-tool-gate` はpermission-systemに登録するauthorizer名です。MCPのaskにだけ `allow` を返し、それ以外は `defer` します。
- この `allow` は、一般的な「MCPを実行してよいか」の確認を省略するためのものです。サービス操作の最終許可ではありません。
- 同じ拡張が登録する独立した `tool_call` Gateが、別途、操作ごとの認可を担当します。
- 連携口がなければ、通常のMCP確認と独立Gateの宛先・本文確認が二重になることがあります。
- 固定ルールの `deny` は連携口で解除できません。固定ルールが `allow` ならchainは不要ですが、独立Gateの検査は残ります。
- 連携口が未登録ならpermission-systemは安全側に倒して次の判断役・人間確認へ進みます。独立Gate自体を無効化した場合まで、同じ保護が残るという意味ではありません。

## コードと個人設定の配置

```text
~/ghq/github.com/cou723/pi-resource-capabilities/
├── resource-capability-gate/  # 独立Gate、bash/LSP sandbox
├── bash-classifier/          # bash限定のLLM reviewer
├── lsp-readonly/             # 読み取り専用LSP adapter
├── patches/                 # 固定版upstreamへの管理patch
├── tests/
└── package.json・lockfile・README

chezmoiの dot_pi/agent/ → ~/.pi/agent/
├── settings.json            # 読み込むpackage、pnpm設定など
├── extensions/
│   ├── pi-permission-system/config.json
│   └── pi-permission-classifier/config.json
├── resource-capability-gate.json
├── resource-capability-runtime.json
├── lsp.json・mcp.json・hermes-memory-config.json
└── agents/・skills/・prompts/
```

- global settingsから独立checkoutをlocal packageとして読み込みます。manifestが指定する3entrypointだけを読み込み、旧コードを `extensions/` に重複配置しません。
- local checkoutは生きたコードであり、固定revisionのインストールではありません。コードの更新も保守作業として扱います。
- chezmoiは共通コードのバックアップではありません。別machineでは、レビュー済みcheckoutを先に用意してください。
- credential、session履歴、node_modules、個人の学習データはGit / chezmoiに入れません。

### 主な設定ファイル

| ファイル | 内容 |
| --- | --- |
| `extensions/pi-permission-system/config.json` | 通常の許可ルール、authorizer chain、確認UIのキー |
| `extensions/pi-permission-classifier/config.json` | LLM reviewerのglobal rubric・model設定 |
| `resource-capability-gate.json` | MCP serverとdomainの対応、GitHub / Slackのgrant |
| `resource-capability-runtime.json` | 保護root、レビュー済みLSP起動argv |
| `lsp.json` | 対象言語・root検出・LSP起動設定 |
| `mcp.json` | MCP接続先と有効・無効の設定 |
| `hermes-memory-config.json` | メモリ・背景review・fallback子session設定 |

runtime / grantはglobal-onlyで、欠落・不正な場合は独立Gateがfail closedになります。trusted project設定から上書きする仕組みはありません。

## 通常ルール：allow / ask / deny

- `allow`：そのルールでは確認不要。ただし独立Gateなどの別の制限は残ります。
- `ask`：authorizer chainへ進み、解決しなければ人間確認。UIがない未解決の要求は拒否されます。
- `deny`：拒否。LLMに判定し直させません。

理由付きdenyも利用できます。理由はagentへの拒否メッセージに含まれます。

```json
{
  "permission": {
    "bash": {
      "*": "ask",
      "pnpm test": "allow",
      "npm *": {
        "action": "deny",
        "reason": "npmではなくpnpmを使用してください。"
      }
    }
  }
}
```

### プロジェクト別のルール

保存先は `<cwd>/.pi/extensions/pi-permission-system/config.json` です。プロジェクトがtrustedになった場合だけ適用されます。

プロジェクト設定はglobal設定より優先されます。設定項目や書き方によってglobalルールを上書きし得るため、「globalの禁止が必ず残る」とは考えないでください。例えばsurface全体を `"bash": "allow"` にするのは、個々の安全なコマンドをallowするのとは違います。

一方、通常ルールの変更では、独立Gateの保護root・必須確認・OS sandboxは解除できません。任意の子ディレクトリごとに設定が自動で積み重なる仕組みとも異なります。

### 確認UIのキー

現在の割り当ては次のとおりです。既定では同じキーを2回押して確定します。

| キー | 操作 |
| --- | --- |
| `1` | 今回だけ許可 |
| `2` | このsessionで、検査が証明した方向に許可 |
| `3` | このsessionで読み書き両方向に許可。提示可能な要求だけ表示 |
| `4` | 拒否 |
| `5` | 理由を入力して拒否 |

`permissionDialogKeys` は既存5操作のキー変更専用です。項目を自由に増やす設定ではありません。session許可は永続化されず、理由付き拒否もプロジェクトのdenyリストへ自動保存されません。ダイアログからプロジェクト設定へ保存する機能は、現在実装していません。

## LLM分類器

upstream `pi-permission-classifier` のentrypointは無効化し、既存reviewerを独自の薄い `bash-classifier` から利用しています。upstreamの `surfaces` 設定では対象限定を強制できないため、コードでbashだけに制限しています。

- 固定ルールが `allow` / `deny` なら分類器は呼びません。対象はchainに到達したbashの `ask` です。
- 結果は `allow` / `deny` / `defer`。`defer` は次の判断役・人間確認へ進む意味です。
- opaque / 対象外の要求、失敗・timeoutなどは `defer` し、失敗を許可として扱いません。
- path / external-directoryの許可をLLMに委譲しません。分類器はMCPにも許可を出しません。
- rubric / modelはglobal設定だけを読みます。プロジェクト設定では差し替えません。
- 既定ではsession modelを使います。`/permission-model provider/model` で当該sessionだけ変更できます。恒久変更はchezmoiのglobal設定で行います。
- 固定版の内部APIを利用しているため、upstream更新には回帰テストが必要です。

## ファイルとbashの保護

### 成果物・削除

- 計画・共有報告：`/tmp/pi/<descriptive-name>.md`。共有文書はfile toolで扱います。
- 一時コード・実行fixture：`/tmp/pi/<session-id>/scratch/`。現在のpathは `/capabilities` で確認します。
- 新しい共有文書は作成可能です。既存共有ファイルは、このsessionで作成・承認済みでない限り、その都度承認が必要です。所有情報はsession entryに記録し、現在branchから再構築します。
- `rm` は対象を検査できる単独literal commandに限定します。自scratch配下は清掃可能、workspace配下の削除は人間による対象確認が必要です。
- root / home / workspace / scratch本体、共有 `/tmp/pi` 本体、他taskの共有成果物は削除できません。変数・glob・chain・wrapperを含むrmや `find -delete` も拒否します。

### 保護root・sandbox

- 読み込まれたコードのpathとrealpath、設定済みroot、認可設定・trust・credentialなどを保護します。対象symlinkの外部実体も保護・遮蔽します。
- 未知のtop-level path付きtoolは、独立Gateではwriterとして扱います。モデルが付けた `readOnlyHint` は証拠にしません。
- bashはLinux bubblewrapで実行します。hostは読み取り専用、writableなのはworkspaceと自session scratchです。保護rootはその後も読み取り専用に戻します。
- bashのPID / networkを隔離し、credential環境変数を除去、主要credential pathを遮蔽します。自scratch以外の `/tmp/pi` へbashで書き込まず、file toolを使います。
- `!` の手動bashも同じsandboxを使います。ただしagentのpermission要求と同一の承認処理ではありません。
- sandboxの失敗・非Linuxではhost実行へfallbackしません。network downloadやworkspace外のwritable cacheを暗黙に許可しません。
- `npm` / `npx`、`gh`、sudo / doas、危険なGit操作などは通常ルールやGateで制限します。GitHub操作は認可Gate付きMCP経由です。
- 保護されたcheckoutに対するbashは、read目的の `git -C` でも方向を証明できず、write禁止で止まる場合があります。迂回しません。
- `file://` や特殊なUnicode空白を使ったpath表記は拒否します。通常のpathを使ってください。

これはpi全体をOS隔離する仕組みではありません。任意の拡張内部、隠れた引数を持つtool、全projectの全秘密、同じOS userによる敵対的変更・TOCTOUまで完全には保護しません。不要なcredentialを渡さず、拡張コードをレビューしてください。`/tmp` の成果物は長期保存先ではありません。

## LSP

有効なのはTypeScript / JavaScript、Python（Pyright）、JSON / JSONC、YAML、C / C++です。

- tool：`lsp_diagnostics` / `lsp_hover` / `lsp_definition` / `lsp_references` / `lsp_symbols`。
- lineは0-based、characterはUTF-16のoffsetです。
- 成功したwrite / editの後は自動診断を追加します。serverは遅延起動し、session終了時に停止します。renameや直接変更するcode-action toolは有効にしていません。
- 明示的diagnosticsはdocumentを開く・更新する処理を行い、初回publicationを最大15秒待ちます。未発行は正常と扱わず警告します。
- 管理patchで空の診断結果を保持し、実際のtext変更時に旧cacheを無効化、同一textの不要な変更通知を抑止、document versionが不一致のpublicationを拒否します。versionなし通知のfreshnessは同等には保証できません。
- trusted extractorが監査済み5toolのread方向を宣言します。保護sourceを読めてもwrite / secret denyは残り、モデルの方向申告では解除できません。
- serverはcheckoutの `resource-capability-gate/lsp-server.mjs <agent-dir> <server-name>` から、runtime設定のdirect argvで起動します。shell / networkなし、hostとworkspaceはread-only、private scratch / cacheだけwritableです。
- upstream projectの `.pi/lsp.json` はhashごとの人間によるtrustが必要です。任意host commandでglobal launcherを迂回できるため、binだけでなくargs / env全体をレビューします。非対話では未知hashを拒否します。

language server資産は `~/.local/share/pi-language-servers/` に別配置します。manifest / lock / build policyは `dot_local/share/pi-language-servers/` で管理し、node_modulesは追跡しません。

固定版：TypeScript 5.9.3、typescript-language-server 6.0.1、Pyright 1.1.414、vscode-langservers-extracted 4.10.0、yaml-language-server 1.24.0。clangdは既存環境を利用します。core-jsの不要なinstall scriptは無効です。

Rustはrust-analyzer / rust-srcを追加しましたが、sandbox内の診断を確認できていないため無効です。build script / proc macro / check-on-saveもtemplateで制限しています。Nix / Go等は今回の導入対象ではありません。

LSPは補助情報です。完了判定にはprojectのtypecheck / lint / testを実行してください。

## MCPと外部操作

GitHub / Slack / Backlogは認証未設定のため、管理設定では無効です。実serviceへの投稿は検証していません。

独立Gateは、認識済みread toolとwrite操作を分類します。未知tool / schemaや不完全なmetadataでは自動grantを与えず、人間確認へ進みます。確認には正確なtool・宛先・argumentsを表示します。表示上限を超えるpayload、承認中に変わった入力は拒否します。UIなしでは未承認操作を実行しません。

| サービス | 自動grantの範囲・条件 | 人間確認になるもの |
| --- | --- | --- |
| GitHub | 明示repo、issue / PR、任意number、担当・依頼中の個人reviewer・author等のサービス事実に一致する既知のcomment操作 | review提出、merge、削除、line comment、未知操作、条件不足 |
| Slack | 明示workspace / channel / 任意thread、必要ならmentionのAPI証拠に一致する既知のplain-text reply | 新規channel投稿、broadcast、予約、blocks / attachments、更新・削除・upload、証拠不足 |
| Backlog | mutationの自動grantなし | mutationは正確な宛先・payloadに対して毎回人間承認 |

- grantは `resource-capability-gate.json` に保存します。GitHub / Slackとも初期grantは空です。
- GitHub metadataはMCPと同じ `GITHUB_MCP_TOKEN` を使い、設定上の認証bindingも検査します。モデルの「担当者です」「PRです」という申告は認可事実にしません。
- Slack OAuthと別の `SLACK_CAPABILITY_TOKEN` を同じidentityとみなしません。自動grantには公式endpointと同じtokenのAuthorization設定が必要です。bindingが証明できないOAuth構成は人間承認になります。
- SlackのmentionはAPI identity / workspaceとthreadの応答を照合します。pagination・証拠不足・API失敗は人間確認へ戻ります。tool名とschemaも実serverで確認する必要があります。
- Backlogは `backlog-mcp-server@0.20.5` をversion固定のpnpm dlxで起動し、project / issue / git toolsetだけを指定します。
- credentialはchezmoi外の環境・secret managerに保存します。GitHubは `GITHUB_MCP_TOKEN`、Slackはapp client ID / `SLACK_MCP_CLIENT_SECRET`、Backlogは `BACKLOG_DOMAIN` / `BACKLOG_API_KEY` を設定し、各serviceの権限を確認します。
- 有効化は、対象serverだけを有効にして反映 → `pi mcp list` と `/capabilities` → read → 意図したwrite拒否 → 専用test対象への明示承認writeの順で検証します。
- audit entryはtool / resource / verdictとpayload hashを記録し、投稿本文やtokenは保存しません。
- 子sessionで確認できない場合は親へ問い合わせます。背景処理やLLMに投稿権限を暗黙に与えません。

## メモリ・Skill・subagent

`pi-hermes-memory` はpolicy-only / compact / lazy initializationで利用します。全メモリを毎turn投入せず、session検索はanchor方式です。

- 背景reviewは20turnまたは30tool call、直近20messageを対象にします。日本語の訂正patternも設定しています。
- automatic consolidation、compact / shutdown時のflush、standing instructionsの投入は初期無効です。
- direct背景completionが子pi processへfallbackするときも、`childExtensionPaths` でpermission-system / bash classifier / 独立Gateを読み込みます。この設定の実model turn全体は未検証です。
- 個人データは `~/.pi/agent/pi-hermes-memory/` と `projects-memory/` に置き、Git / chezmoiから除外します。
- 再利用手順は `skill_manage` で保存します。project固有のpath・手順はproject scope、他repoにも移せる手順だけglobal scopeにします。メモリやSkillは認可設定を上書きしません。
- `workflow-worker` は明示的に必要な別作業・再開可能な処理に利用します。承認UIのない子sessionは危険操作を自動実行せず `ask_parent` を使います。

## 日常コマンド

| コマンド | 用途 |
| --- | --- |
| `/capabilities` | grant、保護root、現在scratch、共有ファイル所有情報 |
| `/permission-model` | reviewerの設定を表示。`provider/model` または `session` はsession限定変更 |
| `/commit` / `/skill:commit-workflow` | 同じcontextで検証・stage・commit。pushや別session作成は含めない |
| `/memory-skills` / `/memory-insights` / `/memory-preview-context` | Hermesの管理・context確認 |

## 保守・再配置

認可設定と拡張sourceは通常起動のagentから変更できません。拒否されたら別tool・shell・子sessionで迂回しないでください。人間のeditor / chezmoiで変更するか、人間が明示的に保守起動します。

```sh
cd ~/.local/share/chezmoi
pi -ne --continue
```

`-ne` は保護拡張を無効化する保守起動です。このsessionで「保護が有効」と判断しないでください。`/reload` では起動flagは解除できません。保守終了後は、`-ne` なしで再起動して実sessionを確認します。

レビュー済みcheckoutを用意したうえで配置・依存を反映します。

```sh
chezmoi apply ~/.pi/agent ~/.local/share/pi-language-servers
pnpm --dir ~/.local/share/pi-language-servers install --frozen-lockfile --config.auto-install-peers=false
cd ~/.pi/agent/npm
pnpm install --frozen-lockfile
cd ~/ghq/github.com/cou723/pi-resource-capabilities
pnpm install --frozen-lockfile
pnpm check
```

host依存の固定版とpatch参照は `npm/` で管理します。`npm/patches` は独立checkoutの `patches/` へのsymlinkです。patchとlockの対応を維持してください。pnpmのSQLite build承認は管理設定にあり、host SDKの重複を避けるためpeer自動導入を無効化しています。

`pi update --extensions` は管理packageの再配置に利用できますが、独自patch / lock / wrapperとの整合も確認してください。patch契約が欠落したLSP adapterは起動失敗にし、無保護のfallbackを行いません。upstream更新時はpatchのレビューと再生成、全テストが必要です。

local commitの1Password SSH署名は人間がダイアログを承認します。timeoutしても署名設定を勝手に無効化しません。push・GitHub repo作成・公開はcommitとは別の承認事項です。

## 固定版と検証範囲

| 依存 | 管理版・利用方法 |
| --- | --- |
| pi | 1.0.0。既存hostを利用 |
| pi-permission-system | 40.0.0 + trusted read direction対応の管理patch |
| pi-permission-classifier | 0.5.2。entrypoint無効、reviewerをwrapperから利用 |
| pi-hermes-memory | 0.9.10 |
| pi-subagents | 23.2.0 |
| pi-lsp | 0.1.7 + diagnostics / profile対応patch。entrypoint無効、adapterから利用 |

独立checkoutの `pnpm check` で、36件のunit / sandbox試験、host型定義によるTypeScript、SDK、実LSP、移設 / symlink、遅延・古いversion・未発行、missing patchを検証します。SDK pathはpnpm metadataまたは `PI_TEST_SDK_ROOT` から解決し、pnpm globalsの物理配置を固定しません。

検証済み：新checkoutの3entrypointの単一読み込み、通常起動の新source hover・正常診断・TS2322・npm deny、保護sourceのreadとwrite拒否、意図的に緩い通常policy下での独立Gate / OS readonly、credentialの専用fixture遮蔽、Backlog mockの承認なし拒否、欠落runtime / patchのfail closed。テストは実外部投稿を行いません。

未検証：実OAuth、production MCP schemaと実投稿、分類器の本格的な精度・latency測定、背景学習 / fallback全体、subagentの実model turn、Rust診断。これらまで安全性・動作確認済みとは主張しません。

構築・移設の記録は `/tmp/pi/environment-build/`、共通コードの詳細は独立checkoutのREADMEを参照してください。
