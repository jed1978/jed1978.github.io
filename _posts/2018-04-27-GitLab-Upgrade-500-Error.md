---
layout: post
title: Upgrade GitLab from 10.3.3 to 10.7.1
key: GitLab
tags: [GitLab, Upgrade, Docker]
---
# Gitlab 10.3.3 EE 更新 10.7.1 EE的問題

## 升版失敗

某同事在某一天星期五上午，提早到了公司，依原先的計畫要~~宰殺~~升級全部團隊共用的Gitlab Server到最新的10.7.1。

他依照原本設計的SOP進行升級後，如沒有意外的話，這篇文章也就不會出現了…
<!--more-->

通訊群組內通知大家升級完成，期望的美好未來沒有發生，團隊陸續回報了下列問題

- ssh: connect to host gitlab.xxxx.net port 8022: Connection refused
- Internal 500 Error

因為事態嚴重，全公司十多個團隊同時發生，所以趕快進行降版復原

但這不是一個童話故事，惡夢並未在降版後就結束了，這是成人世界殘酷的現實…

## 降版失敗

降版後，回報的問題不見了，但取而代之的是AD驗證失敗

`
Could not authenticate you from Ldapmain because "Pg::undefinedcolumn: error: column namespaces.deleted at does not exist line 1: ...s" where ("namespaces"."name" = 'jxxxx.xxxx' and "namespace... ^ : select 1 as one from "namespaces" where ("namespaces"."name" = 'jxxxx.xxxx' and "namespaces"."deleted at" is null and "namespaces"."id" != xx and "namespaces"."parent id" is null) limit 1".
`

對，降版失敗! 雖然同事在升級前有備份完整的設定檔，但還原後確發生了其他的問題，懷疑是Gitlab內部在某一版後變更了DB的schema。 由於狀況愈來愈嚴重，跟執行更新的同事討論後，決定再次升級回10.7.1，讓所有團隊可以先建置要部署到QAT的package。

開弓沒有回頭路，我們只能嘗試看看能不能找到解決方法。

## 問題排查

回到10.7.1後，一開始團隊回報正常，原本以為人品爆發，GitLab恢復正常了，但沒多久開始有人回報這個錯誤

`
fatal: The remote end hung up unexpectedly
error: RPC failed; HTTP 500 curl 22 The requested URL returned error: 500 Internal Server Error
`

接下來沒多久，Internal 500 ERROR也跟著出現，嘗試著重啟服務後又正常一陣子，但約20分鐘後這個狀況就會重覆發生。我們開始逐一清查可疑的部份，這段期間就委曲團隊只能用20分鐘，然後重啟服務。

在檢查了很多部份後，注意到一個錯誤訊息非常可疑

`
time="2018-04-27T07:42:48Z" level=fatal error="Failed to bind mount /var/opt/gitlab/gitlab-rails/shared/pages on /tmp/gitlab-pages-1524814968737227221/pages. operation not permitted"
`

我查了一下GitLab官方的issue列表，發現在5天前有人在10.7.0回報這個[issue](https://gitlab.com/gitlab-org/gitlab-pages/issues/129)，我仔細的讀了整個討論串，確定這個issue在10.7.1並未被修正，也有其他網友提出了workaround，就是把GitLab Page先disabled。

剛好我們之前在建置GitLab時也沒有用到這個功能，所以趕緊在gitlab.rb將Page關閉，然後重啟服務。

`
gitlab_pages['enable'] = false
`

在重啟服務後，各團隊陸續回報功能已正常，但還是有一個問題回報，就是我們用來跟Jenkins做CI整合的Webhook還是壞的。

到GitLab的Webhook頁面按下Push測試，依然會出現500 ERROR的錯誤頁面，研判可能不是同一個問題(``後續解釋第一個問題時，就會知道為什麼我會判斷不是同一個問題``)，上網google了一下，原來是在10.5.6版時對Outbound Request新增了一個設定，用Admin的權限登入設定後，團隊回報功能正常，終於結束這個GitLab升級事件。

## 問題原因分析

這次的主要問題是升級後的500 ERROR，雖然source code不用擔心會掉，但還是造成很大的不便。

根據GitLab的開發人員解釋，這個問題跟Docker有關係，然後我們剛好就是用官方的Omnibus Docker image建置GitLab。

GitLab有一個Page功能，就像是GitHub的Page一樣，用來建置靜態網站，因為這功能會佔用較多磁碟空間，原本是用in-place的方式在Docker內部調用chroot掛載外部Volume

在10.7.0改版後，改成用bind mounting的方式來掛載外部Volume，這對privileged container來說是比較方便的，但**同時他們也移掉了舊版的in-place方式**

問題來了，我們用的官方Omnibus docker image是以Unprivileged 的方式發行，意味著裡面的user不具備外部環境的root權限，所以沒辦法在container內直接使用bind mounting的方式掛載外部的volume，只能用chroot

但因為我們其實沒有開啟GitLab Page的功能，所以直接在參數內關閉Page，繞過了這個issue

官方說這應該要變成一個新功能，提供一個設定值讓使用者決定要用新版的做法還是舊版的，然後default要用舊版的設定，承諾會在之後修正，但不會在10.7.1

## 回顧檢討

其實之前一樣的版本升級也做過幾次，但第一次出現這麼嚴重的狀況，因此也暴露出了一些問題。

- 現有的備份機制做的不太好，應該要有一個能手動進行備份的腳本
- 版本更新一次跳太多版，還挑了一個才發行5天的release
- 應該先確認各版本的已知issue後才決定要更新到哪一個版本
- 沒有環境驗證更新後的結果，等於是直接拿production開刀
