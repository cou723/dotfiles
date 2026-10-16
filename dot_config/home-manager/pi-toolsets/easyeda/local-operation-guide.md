# この環境での EasyEDA Copilot 運用補足

この補足は上流Skillとは別に管理し、NixでSkillに同梱する。上流の工程別ガイド・許可範囲・復旧手順も引き続き守る。
これはローカル環境の実測と運用条件であり、全機能の互換性保証ではない。

## 対象と根拠

- 記録日: 2026-10-16
- Windows EasyEDA Pro Desktop `3.2.206.715d940d`
- Windows側Copilot拡張 / WSL側CLI・Skill `1.3.1`
- 上流固定元: `5d24d1ef17a4a3854253b1fb9cdf907d05e3f9eb`
- 詳細な実験記録は相談拠点 `input-devices-lab` の `references/easyeda-compatibility.md`。このホストでは `/home/coura/ghq/github.com/cou723/input-devices-lab/references/easyeda-compatibility.md`。
  別ホストで資料がなければ、未確認のまま扱う。ここには再利用する手順と注意点だけを置き、文書UUID・daemon ID・設計データは複製しない。

## 起動・接続の切り分け

1. 利用プロジェクトの `nix develop --command project-pi` で起動する。通常のPiにこのSkillをグローバル登録しない。
   `/reload` だけではPATHは更新されない。Skillが見えない場合はプロジェクトの導入案内を確認し、再インストールやグローバル登録で代替しない。
2. 専用ランチャーで起動したセッションでは `easyeda-copilot-cli ...` とコマンド名で呼ぶ。
   PATHが未設定の既存セッションでは、利用プロジェクトのルートで `nix develop --command easyeda-copilot-cli ...` を使う。
   Nix storeの長い絶対パスを毎回転記したり、版ごとのパスを手書きで固定したりしない。上流の絶対launcherパス指定は、一般の生成Skillを直接起動する場合の案内であり、この環境では固定runtimeを選ぶNixラッパーを使う。
   CLI daemonをタスクごとに起動し、そのIDを保持する。終了時は自分のdaemonだけを停止する。
3. `list_easyeda_instances` で接続を確認する。CLI起動成功・TCP疎通・拡張接続は別の確認事項。
4. instanceが0件ならWindows側拡張の版と **External InteractionsがOnか** を確認する。
   今回はOffからOnへ変更後に接続できた。ただしOnにした直後の再確認ではまだ0件だった。再接続時間の上限や追加メニュー操作の必要性は未確定。
   必要ならWindowsからWSLの `127.0.0.1:8787` へのTCP疎通も確認する。TCP成功だけでWebSocket接続成功としない。
5. 接続先は `ws://127.0.0.1:8787`。instanceがあっても、設計未表示のとき `get_current_project_info` は `Current project info not found` を返した。
   対象プロジェクトの編集文書を開き、ツリーと現在文書UUIDを取得する。同一プロジェクト内の文書切替は接続後に `open_document` を使えるので、毎回ユーザーに開いてもらう必要はない。
6. 複数instanceなら明示的に選択し、変更直前にも文書UUID・種類を確認する。Skillの限定読み込みは文書単位のアクセス制御ではない。

## native図形・文字の小変更

この版での初回実測:

- `pcb_PrimitiveString.create/modify/get/delete`: 文字追加、内容変更、X位置変更、一時文字削除と削除後の読み戻しが成功。
- `pcb_PrimitiveLine.create`: 文書化された位置引数で、外形層・シルク層とも拒否された。シルク層では整数座標・線幅でも失敗。
  エラーは `无法创建直线图元，可能是传入的参数不正确`。原因は未特定であり、全条件で不可能、またはDesktopのバグとは断定しない。
- `pcb_PrimitivePolyline.create`: `pcb_MathPolygon.createPolygon` でパスを作り、外形1個とシルク12個を作成できた。
  図形を描く今回の用途では代替できたが、銅箔配線やルーター全体の互換性を保証するものではない。
- `eda.EPCB_LayerId` は今回 `undefined`。enumが利用できると仮定しない。定数を直接使う必要がある場合は、対応するローカルAPI資料で値・型を確認し、出典をコメントに残す。
- 通常のnative PCB座標はmil。mmからの変換は `mm / 0.0254`。フィールド別単位は上流の `execution/pcb-units.md` に従う。

失敗した呼出しをそのまま再実行しない。操作の終端状態と実際の図形を読み戻し、部分適用・重複・対象変更を確認してから修正する。

## 画像と検証

- `preview_pcb` のCopilot独自レンダラーは、初回テストでは外形を表示したがnativeシルク図形・文字が欠落した。
- 同じ状態の `dmt_EditorControl.getCurrentRenderedAreaImage()` は、それらが表示されたEasyEDA自身の画面画像を返した。
- 独自プレビューにないものを「設計に存在しない」と判断しない。nativeデータの読み戻しと実画面を併用する。
  実画面画像も表示範囲・レイヤーに依存し、電気的接続やベタの連続性を証明しない。
- 文書情報・図形の成功から部品配置、回路生成、自動配線、DRCなど全工程の成功へ一般化しない。各工程で独立した確認を行う。

## ユーザー介入と復旧

- `import_pcb_changes` 後は、ユーザーがEasyEDAの取り込みダイアログをApply/確定したとの報告を待つ。
  tool成功応答だけで配置へ進まず、その後PCBの部品・padネットを読み戻す。
- 相談拠点の追加検証記録には、回路図整形が失敗し自動checkpoint復元も失敗して、残存部品のピン接続が失われた例がある。
  原因は未特定。実回路で自動復元を安全保証とせず、正常時の明示checkpoint IDと別の保存・バックアップを確保する。
- checkpointは1文書のものであり、プロジェクト全体のバックアップではない。read-onlyな `execute_js` でも新しいcheckpointが作られるので、最新を復元元と決めつけない。
- 復元前に実行終了・対象文書・戻す状態・途中のユーザー変更を確認し、明示IDで復元する。変更後は部品・ネット・関連図形を照合し、銅箔や接続を変えた場合はnative DRCも行う。

## 記録の分担と更新

具体的な対象・作成物・checkpoint・画像の証跡・未検証事項は作業プロジェクトに記録する。このガイドには再利用する手順と版別の注意点を残す。
新しい検証結果が出たら成功/失敗の条件と根拠を確認して更新する。版変更時は再検証し、過去の実測を現在の保証に読み替えない。
