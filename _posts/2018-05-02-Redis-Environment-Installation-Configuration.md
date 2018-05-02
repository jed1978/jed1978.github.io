---
layout: post
title: Redis系列 - 環境建置篇
key: Redis
tags: [Redis, Docker]
---
# Redis系列 - 環境建置篇

這篇會是Redis系列文的第一篇，著重在建立環境的基本知識。

## 基本介紹

以官方的解釋，Redis是一套Open source的In-memory NoSQL database，可以應用在Cache、Database及簡單的Message broker。

作者則說它是一個`Data Structures Server`，顧名思義，它提供了很多種資料結構及相對應的指令去操作這些資料。由於它是以In-Memory的方式為主，另一個很明顯的特性就是它很快，非常快，正確使用下可以輕鬆的處理每秒上萬的請求。

由於它具備極高的效能與可靠性，在很多系統中都會看到它的身影，對Backend/Fullstack engineer來說，這已經是必備的技能之一。
<!--more-->

## 安裝與設定

安裝Redis有幾種方式，一種是採原生安裝在乾淨的OS上，另一種是使用Docker。本文二種方式都會討論到。

### 原生安裝

測試環境: CentOS 7

CentOS預設有些東西沒有安裝，所以我先安裝一些必要的套件

{% highlight shell %}
yum -y install wget gcc make
{% endhighlight %}

然後用`wget`從Redis官網下載最新的Redis安裝包，這篇文章撰寫時，最新的版本是`4.0.9`

下載完成後解壓縮到你想要放的位置，然後執行make進行編譯

{% highlight shell %}
wget http://download.redis.io/releases/redis-4.0.9.tar.gz
tar xzf redis-4.0.9.tar.gz
cd redis-4.0.9
make
{% endhighlight %}

編譯完成後執行`utils/install_server.sh`，這個腳本會幫你把redis安裝成背景服務

前面幾個選項我都是用`default`，但最後的`redis executable path[]`，請輸入完整的路徑，以我的環境是`/root/redis-4.0.9/src/redis-server`

安裝完成後應該會看到這個訊息

{% highlight shell %}
Selected config:
Port           : 6379
Config file    : /etc/redis/6379.conf
Log file       : /var/log/redis_6379.log
Data dir       : /var/lib/redis/6379
Executable     : /root/redis-4.0.9/src/redis-server
Cli Executable : /root/redis-4.0.9/src/redis-cli
Is this ok? Then press ENTER to go on or Ctrl-C to abort.
{% endhighlight %}

按下ENTER鍵後，就會把redis安裝並執行在背景，接下來我們用redis-cli測試一下

{% highlight shell %}
src/redis-cli -h localhost -p 6379
{% endhighlight %}

如果安裝成功的話，就會連到Redis了，但如果要實際應用到production，請不要學我用root的權限啊…

### Redis的基本設定

Redis安裝完成後，會有預設的設定檔讓它可以正常的執行，但實際應用上，有些設定值還是要調整一下

如果你按照前一個步驟安裝完成，那麼設定檔預設會是在`/etc/redis/6379.conf`

接下來列出的幾個設定值是需要調整的

`bind 127.0.0.1` - 這個要改成這部機器的實際IP，不然其他機器是連不進來的

`port 6379` - 如果你會在同一台主機上跑多個instance，那麼port就一定要分別設定不一樣的

`memory <bytes>` - 設定可用的RAM上限，比如主機有16G，你希望Redis使用8G，剩餘的保留給OS及其他服務，那就設定為`memory 8g`

`maxmemory-policy noeviction` - 配合memory的設定，要設定RAM不足時的回收機制，建議用 `maxmemory-policy volatile-lru`

改完設定存檔後要重新Redis，新設定才會生效

### 使用Docker

雖然Redis的安裝並不困難，但直接使用Docker無疑是更簡單的方式

先假設你已經安裝好Docker的環境，接下來只要輸入下列指令就能快速的跑起來一個Redis instance

{% highlight shell %}
docker run --name MyRedisCache -d -p 6379:6369 redis
{% endhighlight %}

要執行Docker Container內的`Redis-cli`的話就輸入這個指令

{% highlight shell %}
docker run -it --link MyRedisCache:redis --rm redis redis-cli -h redis -p 6379
{% endhighlight %}

### Redis在Docker的基本設定

Redis docker image並沒有自帶redis的config，所有設定值都是用預設的，而且由於docker的一些特性，並不需要特別去設定要bind到哪個實體IP

可是在實際使用時，還是會需要自定義一些設定值，比如`Memory policy`，接下來就一起來看如何建立Redis的設定檔

先連到Redis官網取得對應版本的redis.conf

<a href="https://redis.io/topics/config" target="_blank">Redis configuration</a>

因為拉下來的docker image是4.0.9，所以我是使用對應4.0版的redis.conf

下載回來後找個適合的地方放，因為寫這篇文章時是用Mac，我是放在`/User/jed/Workspace/docker_volume/redis/redis.conf`

然後請先停下正在運行的Redis container，再把`redis.conf`以volume的方式掛載到docker上

{% highlight shell %}
docker stop 6c5b // 6c5b請替換成你運行中的redis container id
docker run -d -p 6379:6379 -v /Users/jed/Workspace/docker_volume/redis/redis.conf:/usr/local/etc/redis/redis.conf redis
{% endhighlight %}

以這個方式掛載上來的redis.conf就可以在host進行修改，修改完再啟用一個新的container就好

附帶一提，官方的docker image沒有自帶vim，如果你想在container編輯的話，請另外以apt-get安裝vim

{% highlight shell %}
apt-get update
apt-get install vim
{% endhighlight %}

## 結語

這篇是學習Redis之前需要知道的基本環境建置，應該算是蠻簡單的。