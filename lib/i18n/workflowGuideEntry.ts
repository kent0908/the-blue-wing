import type { Locale } from "./locale";

export const workflowGuideEntry = {
  "zh-Hant": {
    guide: "工作流教程",
    help: "跟著《最後一班渡船》，從分鏡做到成片",
    copyNote: "複製後會開啟你的私人畫布。",
    settings: "節點設定",
  },
  en: {
    guide: "Workflow guide",
    help: "Make a short film with The Last Ferry workflow",
    copyNote: "Your copy opens in a private canvas.",
    settings: "Node settings",
  },
  ja: {
    guide: "ワークフローガイド",
    help: "『最後の渡し船』で絵コンテから完成まで",
    copyNote: "コピーすると自分専用のキャンバスが開きます。",
    settings: "ノード設定",
  },
} satisfies Record<Locale, Record<string, string>>;
