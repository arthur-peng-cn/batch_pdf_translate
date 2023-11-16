
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const input = process.argv[2];
const outputdir = path.join(__dirname, 'output');
let downloadCount = 0;

async function find_button_by_text(page, text = '翻译') {
    var btntext = text;
    const btn = await page.evaluateHandle((btntext) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // 遍历按钮，查找文本内容包含"翻译"的按钮
        for (const button of buttons) {
            if (button.textContent.includes(btntext)) {
                const rect = button.getBoundingClientRect();
                const isVisible = !!(rect.width || rect.height);
                if (isVisible) {
                    return button;
                }
            }
        }

        return null;
    }, btntext);
    return btn;
}

async function translatePDF(browser, pdfPath) {
    // browser with browser window for test

    const page = await browser.newPage();
    console.log(`try to translating  ${pdfPath}`)
    // await page.goto('https://translate.google.com/?tr=f&hl=' + args[3]);
    await page.goto('https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=docs');

    page.on('request', request => {
        if (request.resourceType() === 'document') {
            downloadCount++;
        }
    });

    page.on('response', response => {
        if (response.request().resourceType() === 'document') {
            downloadCount--;
        }
    });

    const fileInput = await page.$('input[name=file]');
    await fileInput.uploadFile(pdfPath);

    await page.waitForTimeout(1000);

    // 查找包含<span>翻译</span>内容的按钮
    const translateButton = await find_button_by_text(page, "翻译");

    if (translateButton) {
        // 获取按钮的innerText并打印
        const buttonText = await page.evaluate(element => element.innerText, translateButton);
        console.log('按钮的文本为:', buttonText);

        // 执行按钮的点击操作
        await translateButton.click();

        try {
            // await page.waitForNavigation();
            // await page.pdf({ path: args[2] + '.translated.pdf', scale: 0.75, format: 'A4' });
            var downBtn = undefined;
            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
              behavior: 'allow',
              downloadPath: outputdir
            });
            for (i = 0; i < 60; i++) {
                await page.waitForTimeout(1000);
                downBtn = await find_button_by_text(page, "下载译文");
                try {
                    if (downBtn != undefined && downBtn != null
                        && Object.keys(downBtn).length > 0) {
                        break;
                    }
                }
                catch (err) {
                    console.log(err);
                }
            }
            if (downBtn) {
                const buttonText = await page.evaluate(element => element.innerText, downBtn);
                console.log('按钮的文本为:', buttonText);
                await downBtn.click();
                await page.screenshot({ path: './success.png' });
                await page.waitForTimeout(3000);
            }
            else {
                console.log("download btn not found");
                await page.screenshot({ path: './error.png' });
            }
        }
        catch (err) {
            console.log(err);
            await page.screenshot({ path: './error.png' });
        }
    } else {
        console.log('未找到包含<span>翻译</span>内容的按钮');
    }
    await page.close();
}

async function translateDirectory(browser, dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            await translateDirectory(browser, filePath);
        } else if (path.extname(filePath) === '.pdf') {
            await translatePDF(browser, filePath);
        }
    }
}

async function translateInput() {
    const browser = await puppeteer.launch({
        headless: false,
    }
    );
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
        await translateDirectory(browser, input);
    } else if (path.extname(input) === '.pdf') {
        console.log("pdf file process mode.");
        await translatePDF(browser, input);
    }

    // 在这里，你可以检查 downloadCount 的值来判断是否有未完成的下载任务
    var retrytimes = 0;
    while (downloadCount > 0 && retrytimes < 10) {
        retrytimes ++;
        console.log(`There are unfinished download tasks. retry: ${retrytimes} `);
        // await page.waitForTimeout(3000);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    await browser.close();
}

async function main() {
    const input = process.argv[2];
    if (fs.existsSync('node_modules')) {
        if (fs.statSync('node_modules').isDirectory()) {
            await translateInput(input);
        }
    } else {
        require('child_process').execSync('npm install');
        await translateInput(input);
    }
}

main();
