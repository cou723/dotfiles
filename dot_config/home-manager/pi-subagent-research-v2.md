# 定義を必須にし、定義のsandbox条件で動かすPi sub-agentの選定

調査日: 2026-10-10。対象環境: Nix / Home Manager管理のPi 1.1.0、WSL2 / Linux。
**この調査をまとめた時点では、比較と設計判断まで。導入・フォーク・本番設定変更はしていない。**
その後、ユーザー承認によりagwabのheadless runnerを使うLinux向け最小派生構成を実装・検証・反映した。
実装後の条件と検証結果は [pi-defined-subagents/README.md](pi-defined-subagents/README.md) を参照。
以下の比較・probe結果は導入前の調査記録として残す。
前回の `pi-subagent-research.md` の暫定推奨を、この要件に基づいて更新する。

## 結論

1. **24パッケージを候補抽出・スクリーニングした。** 子実行基盤だけでなくsandbox companionも含む。
   主要8候補の定義解決・起動・sandbox境界を重点的に読んだ。全候補の全コードを監査したわけではない。
2. 調べた範囲では、**「定義必須＋定義に結び付いたOS sandbox＋呼び出し側による緩和禁止」を
   インストールと定義ファイルだけで満たす既製品は確認できなかった。** 世界中に存在しないという意味ではない。
3. 独自実装を許すなら、**第一候補は `@agwab/pi-subagent` 0.6.4を実行基盤にした小さな独自フロントエンド、
   または同版のフォーク**。既存のprocess-backed sandboxとtool ceilingを再利用し、定義必須のpolicy resolutionを追加する。
4. **第二候補は `pi-landstrip` 0.19.11**。定義必須と全worker processのOS sandboxをすでに持つ。
   ただし定義別のworkspace／sandbox policyが不足し、親のsandboxにも関わる。独立したsub-agent専用の改修量を見積もる必要がある。
5. `pi-better-subagents` は良いsandbox部品を持つが、今回の要件では第一候補から下げる。
   catalogが実行制限を扱わず、Nix環境のbwrap探索にも実測した問題がある。

## 確認した要件

ユーザーの明示要件:

- 親のコンテキスト圧迫を防ぐために委譲する。
- あらかじめ用意した `researcher.md` / `git-commit.md` 等を明示的に選ぶ。
- 定義が役割と実行条件を持つ。名前から役割を推測する自動判定は不要。
- 定義なしの汎用sub-agent呼び出しはNGにできる。
- researcherはtmp配下で編集・実験し、結論を親に返す。
- Gitの運用手続きを定義側に置き、親に詳細な手続きや途中経過を持ち込まない。

今回の評価条件:

| 条件 | 成立させたいこと |
|---|---|
| 定義必須 | 未指定・未知の定義は起動前に拒否し、general-purposeへfallbackしない |
| 定義が実行ポリシーを持つ | 選んだ定義からtools、workspace、sandbox条件を確定する |
| 呼び出しで緩められない | `sandbox:false`、任意cwd、拡張追加、tool追加などで定義を上書きできない |
| 実際のOS境界 | write/editだけでなくbash、子プロセス、symlink経由の書き込みも制限する |
| 小さい親への返却 | final answerを有界にする。長いログはartifactとして残し、必要時のみ読む |
| すべての起動経路で同じ条件 | 単発、並列、background、resumeで制約が消えない |
| trustedな定義 | 定義の正規パスと内容snapshotを確定し、子からの改変・差し替えを防ぐ |

読み取り範囲、ネットワーク制限、Gitの具体的手順はまだ未決定。
「自由な調査」をネットワーク無制限と解釈した場合の適性も別途評価した。

## 24候補の比較

「OS sandboxなし」は確認した実行経路でOS enforcementを見つけなかったという意味。
worktree、cwd、tool allowlist、promptによる禁止はOS sandboxとは別に分類した。

### 重点候補

| 候補・確認版 | 定義必須／定義の権限 | OS境界 | 判断 |
|---|---|---|---|
| **`@agwab/pi-subagent` 0.6.4** | named Markdown＋tool ceiling。ただし匿名呼び出し可、未知の定義はloaderでundefined。sandboxはcall引数 | headless/tmuxの全processをAnthropic sandbox-runtimeで包む。inline＋sandboxは拒否 | **独自フロントエンド／forkの第一候補**。policyを定義に束ねる部分が不足 |
| **`pi-landstrip` 0.19.11** | taskの`subagent_type`必須、未知の定義は拒否。Markdownもロード。agent permissionはdispatch policy | native sandboxでworker全processを実行。共有sandbox.jsonが中心 | **新しい有力候補**。定義別のworkspace／OS policyとchild-only運用を追加する必要あり |
| **`pi-better-subagents` 0.17.0** | role/named agentがoptional。catalogにsandbox条件を入れると未対応制約として起動不可 | kernel-confined task tools＋trusted runtime。trusted extension toolsはfile rulesの外 | policy bindingとNix backend探索の改修が必要。既製品第一候補から下げる |
| **`pi-subagents` 0.77.0** | named Markdown、fresh、output cap、per-agent launcher。自身にOS sandboxはない | 外部launcherでbackground runnerをsandboxに接続可能 | **外部wrapper＋厳格な起動gateならfork不要の案**。frameworkは多機能で、保護すべき起動面も多い |
| **`@erichll/pi-sandbox` 0.26.0** | builtinは汎用session。pi-subagents連携はnamed agent whitelistと匿名拒否あり | builtinは全process。連携モードはBashのみOS sandboxでwrite/edit/MCP等を除外 | stock構成として近いがper-definition policyではない。別auto-review依存とhost peer問題もある |
| **`@bytetrue/pi-subagent` 0.16.0** | Markdown。未指定はgeneral-purpose。call-level toolsが定義toolsより優先 | OS sandboxなし、Pi child process | 軽量forkの第二案。ただしtool ceiling・sandbox・empty-tools扱いまで新設／修正が必要 |
| **`@gotgenes/pi-subagents` 23.4.0** | type必須だが未知typeをgeneral-purposeにfallback。定義の`locked`で一部引数を固定 | in-process SDK。workspace providerはcwd＋dispose | 定義の権限解決設計は参考になるが、全process sandboxへ変えるには実行基盤変更が必要 |
| **`@pify/subagent` 0.19.0** | agent必須、custom Markdown、project定義に独自trust gate | in-process SDK。worktreeはprompt上の境界、OS sandboxなし | 定義必須／trust設計はよい。sandbox追加のためprocess runnerへの移行が必要 |

### 残りの候補と見送り理由

| 候補・確認版 | 主な理由 |
|---|---|
| `pi-subagent-manager` 0.20.0 | steer/resumeに強いがin-process、通常childはparent履歴snapshot。tool policyはsandboxではない |
| `pi-subagent-feather` 0.2.0 | 有界な親receiptはよいがnamed definitionの選択・OS sandboxを確認できない |
| `@henryqw/pi-subagent` 26.4.0 | Role Markdown、宣言tools、Git writer admissionは充実。Herdr／worktree／checked graphに強く、OS sandboxではない |
| `@signalridge/pi-subagents` 1.11.1 | named type／resource provenance／workflow RPCが充実。ただしOS sandboxなし、用途に対して機能が広い |
| `@d3ara1n/pi-subagent` 3.7.1 | role-based child process、独立contextは適合。model-role ecosystemが必要でOS sandboxなし |
| `brl-subagent` 2.5.0 | Markdown preset／template、background／graphに対応。ただしpresetはdefaultsでcallが優先、force overrideもあり、OS sandboxなし |
| `@fyeeme/pi-subagents` 2.1.3 | Markdown＋process spawn＋recursion ceiling。有用な小型基盤だがOS sandboxなし、公開repository URLもmanifestにない |
| `@mdgchamomile/pi-subagent` 0.8.2 | 親contextを汚さない有界result／tool provenanceは参考になるが、read-onlyでBash・実験・commit不可。OS sandboxではない |
| `pi-subagents-extension` 1.0.0 | path scope／sandboxRoot gateはあるがapplication-level。Bashは文字列patternによる検査でOS confinementではない |
| `@ian-pascoe/pi-minimal-subagents` 0.18.0 | 永続child／capability ceilingはよいがin-process。OS sandboxなし、定義を固定する今回の用途には追加設計が必要 |
| `pi-subagents-j0k3r` 1.6.1 | Markdown registry／nested sessionに対応するがOS sandboxなし |
| `@bermudi/pi-delegate` 0.5.0 | named profile／durable ticket／worktree guardはよいがOS sandboxなし。package manifestにlicense宣言なし（法的結論は出していない） |
| `@ryan_nookpi/pi-extension-subagent` 0.5.15 | Markdown agentを使えるが、READMEが非sandboxと明記。Claude側permission bypassもあり今回の安全境界には不適 |
| `pi-better-sandbox` 0.12.0 | companion。Main/Subagentsの人間設定profileを提供するが、agent definition別のbindingではない |
| `@7resp4ss/pi-sandbox` 0.1.1 | companion。capability gateと継承level ceilingはあるが、selected definitionをauthoritativeにするdispatcherは別途必要 |
| `pi-permission-modes` 2.4.1 | companion。JSON mode＋OS Bash sandbox。定義別child launchとのbindingは別途必要。backend依存不足時にprompt fallbackする記述もあり要件とずれる |

## コードで確認した重要な差分

以下のパスは `~/tmp/pi-subagent-research/<package>/package/` からの相対パス。
`source-evidence.txt` にファイル名・行番号・実際の行を保存した。

### 1. @agwab/pi-subagent: 既存sandboxを再利用しやすいが、定義bindingはない

- `src/index.ts:118–135`: `agent`、`sandbox`、`cwd`、`tools`、`systemPrompt`等をcall引数として公開。
- `src/agents.ts:268–306`: body/model/thinking/toolsはAgentDefinitionへ反映するが、sandboxは生frontmatterに残るだけ。
- `src/orchestrate/run.ts:344–349`: agent省略時にbackend-worker名を生成。名前があってもload結果undefinedをそのまま受け入れる経路。
- `src/orchestrate/run.ts:150–170`: 既存定義のtool ceilingを超えるcall-level toolsは拒否する。これは再利用できる。
- `src/orchestrate/run.ts:695`: sandboxは定義ではなくnormalized inputからrunnerへ渡る。
- `src/sandbox/srt.ts:89–96`: writable scopeはcwd＋artifact paths＋Pi agent-dirのlock paths。denyRead／denyWriteは空。
- `src/sandbox/srt.ts:108–127,173`: singleton SandboxManagerのlock内でrun終了まで待つ。
  同一processからこのhelperを呼ぶsandbox実行は直列化される。並列性能は構成次第であり、fork時に要確認。
- `src/core/validation.ts:205–254`: networkはdomain allowlist。`*`全許可やfilesystem policyオブジェクトは公開入力として受け付けない。
- `src/agents.ts:140–169`: parserはsimple YAMLでnested mappingを無視する。nested sandbox policyにはparser変更が必要。
- `src/agents.ts:208`: global definition rootはhomedir基準。PI_CODING_AGENT_DIRによる独立rootをそのまま期待してはならない。
- `src/agents.ts:79–88`: toolsの空リストはundefinedへ正規化される。strict定義ではemptyとomittedを区別する改修が必要。
- `src/runners/headless-model.ts:1123–1138`: OS wrapperにartifact write pathも渡す。tmp-onlyの例外を設計時に明示する。
- 公開API `@agwab/pi-subagent/api` を持つ。既存raw toolをロードせず、独自toolからAPIを使う構成も候補になる。

元のsandboxは「読み取り制限／秘密情報保護／自由なWeb調査まで完成済み」のものではない。
whole-process isolationを持つことと、要求したpolicyがすべて表現できることは別。

### 2. pi-landstrip: 定義必須＋全process sandboxがすでにある

配布物の `dist/index.ts` はbundledだが、実際にロードされる実装を確認した。

- `:2591–2598`: `task` toolの`subagent_type`は必須。call schemaに任意sandbox条件はない。
- `:4563–4565`: 未知のsubagentを拒否。
- `:920–980`: Markdownを読み、permissionとpromptを正規化。
- `:4911`: agent optionsはPi RPC modeで未対応としてwarning。unknown frontmatterをOS policyへ変換する機能ではない。
- `:4909–5012`: worker cwdは親の`ctx.cwd`。bootstrap/read/write/runtime例外を準備するが、agent別temporary workspaceではない。
- `:6415–6444`: workerも `loadConfig(options.cwd)` の共有sandbox設定からpolicyを生成する。
- `:6485–6503`: native Landstrip `run -p <policy>` でworker processを包む。
- `api.ts`: prepared processとworker extensions等の公開seamがある。ただしread/writePathsは追加grantであり、
  共通policyを定義別に狭めるcompilerが提供済みだと解釈してはいけない。
- provider authのprivate pipe、runtime environmentのscrub、親authの保護は参考になる。
  provider等によりruntime例外も変わるため、全providerで同じ境界という保証はしない。

Markdown定義必須の出発点としては最も近い。ただしnative binary／API dependencyのNix固定、
親にも作用するsandboxの分離、per-agent workspace／policyの拡張が必要。

### 3. pi-better-subagents: catalogとexecution policyが意図的に別

- `catalog-schema.ts:559–601`: sandbox/tools/filesystem等はhost execution control。
  required restrictionを保存するが、実行を強制したことにはせずlaunchをblockする。
- `permission-policy.ts:105–107`: companionから人間設定profileが来ればsandbox:falseを拒否。
  profileがなければlegacy defaultはopt-out可能。
- `index.ts:1931–1940`: agentとsandbox_dir等はoptional call引数。
- `shared-sandbox-core.ts:987–998`: bwrapは`/usr/bin`と`/bin`だけ探索する。
  この環境のNix store / ~/.nix-profile/binは標準探索に含まれない。
- `shared-sandbox-core.ts:1635–1643`: profileありならbackend不足を拒否。
  legacy implicit defaultでbackend不足ならundefinedを返す（呼び出し側のunconfined経路へ）。
- kernel file worker、trusted extension tools、runtimeを区別する設計は充実している。
  その分、定義bindingを足す改修はcatalog・policy・launch・batch・snapshotにまたがる。

### 4. pi-subagents + @erichll/pi-sandbox: 既製品の組合せとして近いが制約が大きい

- `@erichll/.../src/pi-subagents-native.ts:365–370`: allowedAgents＋固定5-tool ceilingを登録。
- `:399–408`: anonymous／workflow launchを拒否し、direct named agent＋async:trueを要求する。
- linked docsが明示する通り、連携モードにはouter whole-worker sandboxはない。
  write/edit/MCPを外し、変更チャネルをsandboxed Bashに寄せる。
- policyは共通workspaceで、per-definition tmp scopeには追加設定／変更が必要。
- builtin modeはwhole-worker sandboxだがnamed Markdownによる今回の契約とは別。
- `@erichll/pi-auto-review` がruntime依存。以前のpermission-systemを再導入するわけではないが、
  「子の静的sandboxだけ欲しい」用途には余分なapproval broker構成になる。
- 現在のPi 1.1.0のhost typeboxは1.3.27。このpackageはtypebox>=1.3.36をpeerに要求し、宣言範囲外。
  Pi versionが一致することだけで互換と判断できない。

### 5. 小型runnerをforkする場合の比較

- ByteTrueはprocess-backed、runtime dependenciesなし、named Markdownなので出発点は小さい。
  しかし`src/index.ts:799`の匿名general-purpose、`:910–919`のcall tools優先、`:988`のempty tools時に
  --tools自体を省略する挙動をstrictなpolicyに変え、OS wrapperまで新設する必要がある。
- gotgenesは`locked`によるmodel/thinking/max_turns/inherit_context/backgroundの固定をすでに持つ。
  ただし`src/tools/spawn-config.ts:95–99`に未知typeのgeneral-purpose fallbackがあり、
  workspace seamがcwd＋disposeだけなのでwhole-process sandboxにはrunner変更が必要。
- pifyはagent必須とproject trust設計がよいが、in-process sessionを別processに移す作業が必要。
- MDGChamomileのbounded envelope、tool provenance、readiness markerは結果境界の設計参考。
  read-only探索専用なので、writerへ変えることは小改修ではない。

## fork / 独自拡張の選び方

変更量の「小・中・大」は設計上の相対評価。実装日数や差分行数を見積もったものではない。

| 方針 | 再利用する部分 | 追加／変更する部分 | 相対負担 |
|---|---|---|---|
| **agwabのpublic APIを使う独自フロントエンド** | process runner、sandbox、artifact、cancel/status | strict registry、definition→execution compile、小さいtool schema、有界result | **中**。APIが表現できるcwd＋domain allowlistの範囲ならforkせず始められる |
| **agwabをfork** | 上記＋既存tool ceilingとtest assets | nested YAML、必須definition、fallback除去、policy固定、network/filesystem拡張、runtime-dir分離 | **中。推奨**。今回の境界に必要な変更を一つの基盤に集約できる |
| **Landstripをfork／upstreamへ拡張** | 必須definition、native whole-process sandbox、RPC、private auth transport | per-agent workspace/policy、child-only enable、result cap、Nix native packaging | **中〜大**。安全なruntime設計を重視する対抗案 |
| **ByteTrueをfork** | child spawn、named role、進捗、非同期完了 | sandbox adapter、authoritative parser/compiler、override拒否、empty-tools修正 | **中〜大**。単純な起動面を優先するときの対抗案 |
| **pi-subagents＋専用launcher＋起動gate** | named agent、per-agent launcher、fresh、output controls | typed-only gate、外部sandbox wrapper、専用runtime paths、全起動面の制限 | **中〜大**。本体forkなしで実現する案。既存多機能を活用したい場合向け |
| **pi-better-subagentsをfork** | task sandbox core、結果pagination、detached callback | catalog policy compiler、definition必須、shared/batch override禁止、snapshot、Nix discovery | **大**。既存ecosystemの分離設計をまたぐ変更になる |
| **完全新規** | Pi SDK/CLI、bwrap等だけ | 全runner、auth/bootstrap、cancel、status/result、policy、tests | **大**。少ないソース量に見えても、lifecycleと安全性の責任が増える |

### 推奨する最小構成

親に見せる起動toolは、まず次の程度に絞る。

```text
委譲: { agent: 登録済み定義ID, task: 自己完結した依頼 }
結果: { runId }
停止: { runId }
```

`cwd`、`tools`、`sandbox`、`extensions`、`systemPrompt`をmodelの起動引数に出さない。
定義のtrusted正規パス・digestとcompiled policyを親runtimeがsnapshotし、
単発／background／resumeで同じsnapshotを使う。unknown definitionは必ず起動前に拒否する。

- **researcher**: trusted compilerが`~/tmp/<job>`を作り、そのworkspaceにだけtask writeを許可する。
  child agent-dir、session、artifact、scratchも可能な限りjob配下へ置く。
- **git-commit**: 依頼対象repoの確認済みrootを使い、必要な`.git`操作も境界に含める。
  worktreeの場合はGitのadmin pathsがroot外にある点に注意。push/amend/rebase/resetの扱いは未決定。
- **返却**: status、短い結論、成果物path、usage。詳細ログを親tool resultへ丸ごと入れない。
  truncationは明示し、failure/partialをsuccessと混同しない。
- **初期版では** recursive agents、workflow graph、scheduler、任意external runner、tmux、
  project定義の自動overrideを無効にする。必要になったときに境界を保ったまま追加する。

これは未実装の設計案であり、既存packageのそのまま使えるschemaではない。

### フロントエンドだけで足りる範囲とforkが必要になる範囲

agwabのAPIを使い、既存raw extension toolはロードしない構成なら、
親に匿名呼び出し・sandbox overrideを提供しない独自toolを作れる可能性がある。
ただしAPIの表現はcwdとdomain allowlist中心である。

**任意サイトへの自由調査＋tmp-only writeを同時に行うこと、agent-dirとenvの厳密な分離、
read制限／protected definitions等を一つのpolicyとして宣言することまで求めるなら、
APIフロントエンドだけで十分と確認できていない。** このためfork案を第一候補とする。
「数行のtool_call hookを足せば完成」とは評価しない。

## 実行して確認したこと

### 自作のoffline probes: 15ケース

`~/tmp/pi-subagent-research/probe-policies.mjs` をNode 22.23.2で実行。
`probe-results.json` に実際の結果を保存した。

確認した振る舞い:

- agwabのsandbox frontmatterが実行条件へ反映されない。
- agwabの匿名input、call-level sandbox opt-outがvalidationを通る。
- agwabの未知definitionがloaderでundefinedになる。
- agwabのinline＋sandboxが拒否される。
- betterのdefinition内sandboxがblocking restrictionになる。
- betterのlegacy profileはopt-outでき、人間設定profileはopt-outを拒否する。
- betterのpath policyがworkspace外とsymlink escapeを拒否する。
- betterのbackend不足時のenforced拒否／legacy implicit fallbackを再現。
- **betterの標準backend discoveryはこの環境でsupported:false。**
- betterのupstream test seamにNix bwrapの実パスを渡すと、生成されたOS wrapperは
  workspace内writeを許可し、外部writeとsymlink経由writeをread-only filesystemとして拒否した。

最後の3ケースは**test seamで探索だけ差し替えたhelperのkernel試験**。
stock extensionがNixで動いたという結果ではない。

15件のPASSは「期待した観察・反例を再現できた」という意味であり、
15件の製品要件に合格したという意味ではない。

### upstreamの小さい純粋test

agwabのnpm `gitHead` に対応するsource archiveを取得し、
`test/checks/sandbox-agent-locks.mjs` を実行。lock path checks passed。
これはlock path計算だけのtestであり、sandbox全体やPi互換性の証明ではない。

### 配布物・sourceの取得

- 24候補のnpm metadataとtarballを取得。tarballのregistry integrityを24件すべて検証した。
- agwab、better-subagents、erich sandbox、ByteTrueはnpm `gitHead` のsource archiveも取得し、
  sourceとtest assetsの構成を確認した。
- 7関連repositoryのarchived／pushed_at等を取得。今回見たものはarchived:false。
  star数や最終pushを安全性・保守継続の保証とは扱わない。
- dependency install／lifecycle script実行／model呼び出し／本番extensionロードは行っていない。
- better catalog parserのoffline試験だけ、Pi hostのyaml moduleを研究用node_modulesへsymlinkした。
  本番のnpm directory、settings、extensionsには変更していない。

## 採用前に必要な試験

1. **定義なし・未知定義・壊れた定義**がすべてprocess作成前に拒否される。
2. tool追加、sandbox無効化、cwd変更、extension追加、systemPrompt置換をcallで行えない。
3. workspace外のwrite/edit/bash、symlink、rename、子processで同じ境界が保たれる。
4. childから定義・parent settings/auth/extension codeを変更できない。
5. backend不在／起動失敗／invalid policy／一部bootstrap失敗でunconfinedへfallbackしない。
6. provider transportが機能し、必要なruntime例外が最小限かつ明示的である。
7. background、stop、session shutdown、resumeにpolicyとownershipが保持される。
8. timeout時にcommit等の副作用を二重実行しない。partial artifactを消さずに報告する。
9. 子の全transcript・巨大output・stderrが親contextへ自動的に入らず、有界resultになる。
10. Nixでhost peers／native backend／全runtime dependenciesを固定し、Pi 1.1.0 loaderで検査する。

**未検証**: 実Pi全extensionロード、モデル通信、全upstream tests、macOS、全候補のsecurity audit。
特にagwabのsandbox-runtime自体がこのNix構成で動くことはまだ試験していない。

## 参照・成果物

主要repository:

- https://github.com/AgwaB/pi-subagent （MIT、確認gitHead `91d40e3031b99f9c2da8e3f5c96ac05f377bd8e2`）
- https://github.com/landstrip/landstrip （pi-landstrip packageはApache-2.0。npmにgitHeadなし）
- https://github.com/1aboveio/pi-better-harness （MIT、確認gitHead `22496565562c375d4157a6c0d3221fee736b38ce`）
- https://github.com/nicobailon/pi-subagents （MIT）
- https://github.com/erichll/pi-packages （pi-sandbox packageはApache-2.0、確認gitHead `6eb4d9668f6d23fb6793029d5d145b8ae0fcd0ad`）
- https://github.com/ByteTrue/pi-package-mono （pi-subagent packageはMIT、確認gitHead `8e6dff1830b2b7893c532fe99b8966e3376e0b3b`）
- https://github.com/gotgenes/pi-packages （pi-subagents packageはMIT）
- https://github.com/pifydev/subagent （MIT）

研究用directory: `~/tmp/pi-subagent-research/`

| ファイル | 内容 |
|---|---|
| `inventory.json` | 24候補のversion、peer/runtime deps、license、repo、integrity、検証結果 |
| `search-sandbox.json`, `search-subagents.json` | npm候補検索の取得結果 |
| `<package>/registry.json`, `package/` | 確認した公開配布物とmetadata |
| `<package>/upstream/` | 一部重点候補のnpm gitHeadに対応するsource archive |
| `source-evidence.txt` | 重要実装のpath／行番号／実際の行 |
| `probe-policies.mjs`, `probe-results.json` | 再実行可能なoffline policy probesと実測結果 |
| `upstream-lock-test.txt` | 小さいupstream lock-path testの実際の出力 |
| `repository-metadata.json` | 公開repositoryの状態。保守保証ではない |

forkでは元packageと各dependencyのlicense／NOTICEを維持する。
Nix storeを直接patchせず、固定sourceからbuildする。今回forkや実装はまだ作っていない。
