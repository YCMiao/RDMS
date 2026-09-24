on run
    set appPath to POSIX path of (path to me)
    set projectDir to do shell script "/usr/bin/dirname " & quoted form of appPath
    set updateScript to projectDir & "/scripts/update_rdms.sh"
    set logPath to projectDir & "/.rdms-update.log"

    set choice to button returned of (display dialog "更新 RDMS 并打开浏览器？会先检查数据库连接，再更新前后端。现有记录和文件会保留。" buttons {"取消", "更新"} default button "更新" with icon note)
    if choice is not "更新" then return

    try
        display notification "正在检查数据库并构建 RDMS；完成后会自动打开浏览器。" with title "更新 RDMS"
    end try
    try
        with timeout of 1800 seconds
            do shell script "/bin/sh " & quoted form of updateScript & " > " & quoted form of logPath & " 2>&1"
        end timeout
        set portText to do shell script "cd " & quoted form of projectDir & " && /Applications/Docker.app/Contents/Resources/bin/docker compose port frontend 80 | /usr/bin/awk -F: '{print $NF}'"
        set siteUrl to "http://127.0.0.1:" & portText & "/"
        do shell script "/usr/bin/open " & quoted form of siteUrl
        display dialog "RDMS 已更新，浏览器已打开。" buttons {"完成"} default button "完成" with icon note
    on error errorMessage number errorNumber
        set failureDetail to "更新未完成，请查看日志了解原因。"
        try
            set lastFailure to do shell script "/usr/bin/grep '^RDMS 更新失败：' " & quoted form of logPath & " | /usr/bin/tail -n 1"
            if lastFailure is not "" then set failureDetail to lastFailure
        end try
        set choice to button returned of (display dialog failureDetail buttons {"关闭", "查看日志"} default button "查看日志" with icon caution)
        if choice is "查看日志" then do shell script "/usr/bin/open -a TextEdit " & quoted form of logPath
    end try
end run
