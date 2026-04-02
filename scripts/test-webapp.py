#!/usr/bin/env python3
"""
CC-Remote Web 应用功能测试
使用 Playwright 测试前端页面功能
"""

from playwright.sync_api import sync_playwright
import time

def test_webapp():
    with sync_playwright() as p:
        # 启动浏览器
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        print("🌐 访问前端页面...")
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')

        # 截图 - 初始状态
        page.screenshot(path='/tmp/cc-remote-01-initial.png', full_page=True)
        print("✅ 截图保存: /tmp/cc-remote-01-initial.png")

        # 检查页面标题
        title = page.title()
        print(f"📄 页面标题: {title}")

        # 查找登录表单元素
        print("\n🔍 检查页面元素...")

        # 检查是否有登录表单
        email_input = page.locator('input[type="email"], input[placeholder*="邮箱"], input[placeholder*="email"]')
        password_input = page.locator('input[type="password"]')
        login_button = page.locator('button:has-text("登录"), button:has-text("Login")')

        elements_found = {
            "邮箱输入框": email_input.count() > 0,
            "密码输入框": password_input.count() > 0,
            "登录按钮": login_button.count() > 0
        }

        print("页面元素检测结果:")
        for name, found in elements_found.items():
            status = "✅" if found else "❌"
            print(f"  {status} {name}")

        # 获取所有按钮
        buttons = page.locator('button').all()
        print(f"\n📋 发现 {len(buttons)} 个按钮:")
        for i, btn in enumerate(buttons):
            text = btn.inner_text() or btn.get_attribute('aria-label') or "(无文字)"
            print(f"  {i+1}. {text[:50]}")

        # 获取所有输入框
        inputs = page.locator('input').all()
        print(f"\n📋 发现 {len(inputs)} 个输入框:")
        for i, inp in enumerate(inputs):
            inp_type = inp.get_attribute('type') or 'text'
            placeholder = inp.get_attribute('placeholder') or '(无提示)'
            print(f"  {i+1}. type={inp_type}, placeholder={placeholder}")

        # 测试登录流程
        if email_input.count() > 0 and password_input.count() > 0:
            print("\n🔐 测试登录流程...")

            # 填写邮箱
            email_input.first.fill("test@example.com")
            print("  ✅ 填写邮箱: test@example.com")

            # 填写密码
            password_input.first.fill("testpassword")
            print("  ✅ 填写密码: ********")

            # 截图 - 填写后
            page.screenshot(path='/tmp/cc-remote-02-filled.png', full_page=True)
            print("  ✅ 截图保存: /tmp/cc-remote-02-filled.png")

            # 点击登录
            if login_button.count() > 0:
                login_button.first.click()
                print("  ✅ 点击登录按钮")

                # 等待响应
                time.sleep(2)
                page.wait_for_load_state('networkidle')

                # 截图 - 登录后
                page.screenshot(path='/tmp/cc-remote-03-after-login.png', full_page=True)
                print("  ✅ 截图保存: /tmp/cc-remote-03-after-login.png")

                # 检查是否登录成功或有错误提示
                error_msg = page.locator('.error, .alert-error, [class*="error"]')
                if error_msg.count() > 0:
                    print(f"  ⚠️ 错误提示: {error_msg.first.inner_text()}")
                else:
                    print("  ℹ️ 未发现错误提示")

        # 测试深色模式切换
        dark_mode_toggle = page.locator('[class*="dark-mode"], button[aria-label*="主题"], button[aria-label*="theme"]')
        if dark_mode_toggle.count() > 0:
            print("\n🌙 测试深色模式...")
            dark_mode_toggle.first.click()
            time.sleep(0.5)
            page.screenshot(path='/tmp/cc-remote-04-dark-mode.png', full_page=True)
            print("  ✅ 深色模式截图保存")

        # 检查侧边栏
        sidebar = page.locator('[class*="sidebar"], nav, aside')
        if sidebar.count() > 0:
            print(f"\n📁 发现侧边栏")

        # 获取页面内容摘要
        print("\n📊 页面内容摘要:")
        print(f"  - 总元素数: {page.locator('*').count()}")
        print(f"  - 链接数: {page.locator('a').count()}")
        print(f"  - 按钮数: {len(buttons)}")
        print(f"  - 输入框数: {len(inputs)}")

        browser.close()
        print("\n✅ 测试完成!")

if __name__ == "__main__":
    test_webapp()
