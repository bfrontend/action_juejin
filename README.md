## 定时任务脚本

掘金自动签到 签到后会获得一次免费抽奖机会，自动触发免费抽奖。
执行结束发送邮件通知签到结果。 

使用方法：fork 本仓库

打开浏览器，登陆掘金，F12 查看 Network 面板，复制 cookie

打开 github 仓库的 Setting，选择 Secrets，新建下列 4 个仓库 Secret
| key | value |
| --- | ---|
| COOKIE | 值为上面复制掘金的 cookie |
| USER | 发送邮件的邮箱地址，该邮箱需要开启 SMTP |
| PASS | 该邮箱的 SMTP 密码 |
| TO | 接收邮件的邮箱 |

`注意：掘金的cookie大概有一个月的有效期，所以需要定期更新Secret`
