# Auto Commiter

## 概要

このプロジェクトは、Gitで管理されているソフトウェアプロジェクトのローカルリポジトリに対して、**開発者の手動操作なしに変更のステージングとローカルコミットを自動で行う**ソリューションを開発することを目的としています。コミットメッセージは**LLM（大規模言語モデル）を活用して自動生成**します。

## 目的

開発プロセスにおいて、頻繁な手動でのステージングやコミット作業は煩雑であり、コミットメッセージの質を維持することも課題となります。このツールは、これらの作業を自動化することで、開発者の負担を軽減し、より本質的な開発作業に集中できる環境を提供することを目指します。また、LLMによるコミットメッセージ生成により、一貫性のある分かりやすいコミット履歴の維持を支援します。

## 主な機能

*   **ファイル変更監視:** 設定ファイルで指定された監視対象ディレクトリ（デフォルト: `src/`）内のファイルの作成・更新・削除 (Create/Update/Delete) を検知します。
*   **自動ステージング・コミット:** ファイル変更が検知された際に、自動的に変更をステージング (`git add .`) し、ローカルコミット (`git commit`) を実行します。
*   **LLMによるコミットメッセージ生成:** コミット対象の差分 (`git diff`) を基に、LLM (OpenAI API, ローカルLLMなど) を利用して適切なコミットメッセージを自動生成します。生成されたメッセージには `[Auto commit]` のような接頭辞を付与し、手動コミットとの区別を容易にします。
*   **監視対象の設定:** 設定ファイル（例: `.autocommitignore` のような形式）で、自動コミットの監視対象となるディレクトリやファイルをホワイトリスト形式で指定できます。これにより、意図しないファイル（例: `node_modules/` 内のファイル）がコミットされるのを防ぎます。

## 実装方法 (案)

以下の技術スタックとアーキテクチャを想定しています。

*   **開発言語:** Node.js
    *   理由: `npx` によるローカルインストール不要な実行が可能であり、利用者の利便性が高い。クロスプラットフォーム対応のファイルシステム監視 (`chokidar`) や非同期処理、外部プロセス実行 (`child_process`) が容易なため。Python (`pipx` + `watchdog` 等) も代替候補となり得るが、まずは Node.js で進める。
*   **コア機能 (依存ライブラリは最小限に):**
    *   **設定ファイル処理:** プロジェクトルートの `.autocommitrc` (YAML形式) ファイルを `js-yaml` ライブラリで読み込み、監視対象パスやLLM設定などを取得します。
    *   **ファイル監視:** `chokidar` ライブラリを使用し、設定された監視対象パス内のファイル変更 (追加, 更新, 削除) を効率的に検知します。
    *   **Git 操作:** Node.js 標準の `child_process` モジュール (`spawn` または `exec`) を利用して `git` コマンド (`add`, `diff HEAD`, `commit`) を直接実行します。(`simple-git` 等の追加ライブラリは使用しない方針)
    *   **初期化処理 (`init` コマンド):**
        *   `.autocommitrc` と `.env.example` のテンプレート生成。
        *   `.gitignore` への `.env` 追記。
        *   **対話形式での VS Code 自動起動設定:** ユーザーに VS Code でワークスペースを開いた際に自動で `start` コマンドを実行するか確認し、同意があれば `.vscode/tasks.json` を自動生成または追記（既存タスクを保持しつつ安全に追加）します。
    *   **LLM 連携 (初回は OpenAI):**
        *   OpenAI API を利用する場合は `openai` ライブラリを使用。APIキーは `.env` ファイルから `dotenv` ライブラリで読み込みます。
        *   `git diff HEAD` の結果をプロンプトに含め、コミットメッセージ生成を依頼します。
        *   将来的には Ollama 等のローカルLLM連携も検討 (HTTPリクエストで実装可能)。
    *   **変更検知の制御:** 短時間に多数のファイル変更が発生した場合に備え、デバウンス処理（一定時間変更がなければ処理を実行）を導入し、コミットの頻度を適切に制御します。
*   **実行形態 (CLI ツール):**
    *   `npx` を介して実行可能な CLI (Command Line Interface) ツールとして提供します。
    *   **主な利用方法:** `init` コマンド実行時に設定される VS Code のタスク機能により、ワークスペースを開くと**自動的にバックグラウンドで**ファイル監視プロセスが起動します (推奨)。
    *   **代替利用方法:** VS Code を使用しない環境や、手動で起動したい場合は、プロジェクトディレクトリで `npx auto-commiter start` コマンドを実行し、ファイル監視プロセスを**フォアグラウンドで**起動することも可能です。
    *   監視プロセスの停止は、VS Code のタスクとして実行されている場合は VS Code のターミナルパネルから、フォアグラウンド実行の場合は `Ctrl+C` で行います (`stop` コマンドは提供しません)。
    *   VS Code 拡張機能は、利用者の利便性を考慮し、現時点では採用しません (タスク機能での連携を主とするため)。


## 導入手順 (想定)

1.  **前提:**
    *   Node.js および npm (または yarn, pnpm) がインストールされていること。
    *   Git がインストールされていること。
2.  **初期セットアップ (プロジェクトごと):**
    *   対象の Git リポジトリのルートディレクトリで、以下のコマンドを実行し、Auto Commiter を利用するための初期設定を行います。
    ```bash
    npx auto-commiter init
    ```
    *   このコマンドは以下の処理を行います:
        *   **設定ファイルテンプレートの生成:**
            *   `.autocommitrc` (YAML形式): 監視対象パスやLLM設定を記述するためのテンプレート。
            *   `.env.example`: OpenAI APIキーを設定するためのテンプレート。
        *   **`.gitignore` の更新:** `.env` ファイルを Git 管理対象外にするため、`.gitignore` に `.env` を追記 (ファイルがなければ生成)。
        *   **VS Code 自動起動設定 (対話式):**
            *   コマンド実行中に「VS Code でこのワークスペースを開いた際に自動で Auto Commiter を起動しますか？ (y/N)」のように確認されます。
            *   `y` と回答すると、`.vscode/tasks.json` に Auto Commiter を自動起動するタスクが追加されます (ファイルが存在しない場合は作成、存在する場合は安全に追記)。
3.  **API キー設定:**
    *   生成された `.env.example` ファイルを `.env` にリネームします。
    *   `.env` ファイルを開き、`OPENAI_API_KEY` にご自身の OpenAI API キーを記述します。
    ```dotenv
    # .env
    OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```
4.  **監視対象設定:**
    *   生成された `.autocommitrc` ファイル (YAML形式) を開き、`watchPaths` に監視したいディレクトリやファイルを指定します (デフォルトは `['src/']`)。
    ```yaml
    # .autocommitrc
    watchPaths:
      - src/
      # - docs/
      # - tests/
    llm:
      provider: openai # 初回は openai のみサポート
      model: gpt-3.5-turbo # 使用するモデル
    # debounceDelay: 1000 # デバウンス時間 (ms、任意)
    ```
5.  **監視開始:**
    *   プロジェクトルートで以下のコマンドを実行し、**現在のターミナル上で**ファイル監視プロセスを起動します。
    ```bash
    npx auto-commiter start
    ```
    *   監視プロセスはフォアグラウンドで実行され、ファイル変更の検知やコミット実行のログがこのターミナルに表示されます。
    *   **注意:** このターミナルセッションで `Ctrl+C` を押すか、ターミナルを閉じると監視プロセスも終了します。監視を続ける間は、このターミナルを開いたままにしておく必要があります。開発作業は別のターミナルインスタンスで行ってください。
6.  **開発作業:**
    *   `.autocommitrc` で指定した監視対象内のファイルを変更・保存すると、ツールが変更を検知し、自動的にステージングとコミット（LLMによるメッセージ生成付き）を実行します。ログは `start` コマンドを実行したターミナルに出力されます。
7.  **監視停止:**
    *   `start` コマンドを実行したターミナルで `Ctrl+C` を押してプロセスを停止します。(`npx auto-commiter stop` コマンドは提供しません。)

## 既存の類似ツール

`idea_memo.md` の調査によると、コミットメッセージをAIで生成するツールは既に存在します。

*   `aicommits`: OpenAI GPT を利用。
*   `aicommit2`: ローカルLLM (Ollama等) を利用。
*   `CommitCraft`: AIによるメッセージ生成。
*   IDE機能: Cursor や GitHub Copilot など、IDE内でメッセージ生成機能を提供。

ただし、**ファイル変更をトリガーとしてステージングとコミット自体を完全に自動化するツールは一般的ではない**ようです。本プロジェクトは、これらの既存ツール（特にメッセージ生成部分）の機能を活用しつつ、**ファイル変更検知に基づく自動ステージング・コミット**を実現する点に独自性があります。

## 注意点

*   **コミット履歴の肥大化・汚染:** ファイル変更ごとの自動コミットは、リポジトリの履歴を細かくしすぎる可能性があります。適切なコミットの粒度を保つための工夫（例: 一定時間内の変更をまとめる、特定の操作時のみコミットするなど）が必要になるかもしれません。
*   **意図しないコミット:** 監視対象の設定を誤ると、ビルド生成物や一時ファイルなどがコミットされる可能性があります。ホワイトリスト方式の監視対象設定を適切に行うことが重要です。また、監視の開始・終了条件（IDE連携など）や、一時停止機能の実装も検討します。
*   **パフォーマンス:** 大規模なリポジトリや頻繁なファイル変更がある場合、監視プロセスのパフォーマンス影響を考慮する必要があります。
*   **LLMのコストと精度:** OpenAI APIなどの外部LLMを利用する場合、API呼び出し回数が増えることによるコスト増に注意が必要です。ローカルLLMを利用する場合は、実行環境の準備とモデルの精度が課題となります。

## 今後の展望

まずは、ファイル変更監視ツールとスクリプトを組み合わせ、設定ファイルに基づいて特定のディレクトリ（例: `src/`）の変更を検知し、自動でステージングとコミット（固定メッセージ）を行う基本的な機能の実装を目指します。その後、LLM連携によるコミットメッセージ生成機能、IDE連携による監視制御、設定ファイルの拡充（無視ルールの追加など）を進めます。
