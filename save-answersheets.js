#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const urlUtils = require('url');
const util = require('util');
const { http, https } = require('follow-redirects');

const options = require('minimist')(process.argv.slice(2), {
    alias: { h: 'help', v: 'version' },
    boolean: ['help', 'version', 'skip-pdfs'],
    string: ['download-only', 'redownload-if-smaller'],
    default: {
        'download-only': '',
        'redownload-if-smaller': '',
        'skip-pdfs': false
    }
});

if (options.help || options._.length !== 1) {
    console.log('Usage: ./save-answersheets.js [options] <instructionfile>');
    console.log('  --download-only=924106840112   只下载指定学号');
    console.log('  --redownload-if-smaller=5MB    PDF 小于此大小则重下');
    console.log('  --skip-pdfs                    跳过 PDF 下载（调试用）');
    process.exit(0);
}
if (options.version) {
    console.log('save-answersheets direct-pdf version 2025-11-12');
    process.exit(0);
}

(async () => {
    try {
        if (options['redownload-if-smaller']) {
            options['redownload-if-smaller'] = parseBytes(options['redownload-if-smaller']);
        }
        await processInstructionFile(options._[0]);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();

async function processInstructionFile(file) {
    const script = await util.promisify(fs.readFile)(file, 'utf8');
    const actions = parseScript(script);
    if (actions.length === 0) throw new Error('指令文件为空');

    await fs.promises.mkdir('output', { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Users\\a\\AppData\\Local\\Microsoft\\Edge SxS\\Application\\msedge.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});
    let cookies = '';

    const start = Date.now();
    console.log('开始下载', new Date().toLocaleString());

    for (const act of actions) {
        if (act[0] === 'cookies') {
            cookies = Buffer.from(act[1], 'base64').toString('ascii');
            continue;
        }
        if (act[0] !== 'save-pdf') continue; // 只处理 PDF

        const url = act[1];
        const relativePath = act[3]; // 例如 924106840112/responses.pdf

        // 提取学号：取路径第一段，或者直接从文件名猜
        const studentId = path.dirname(relativePath).split(path.sep)[0] || 
                        path.basename(relativePath, '.pdf').replace(/[^0-9]/g, '');

        if (options['download-only'] && !studentId.includes(options['download-only'])) {
            continue;
        }

        const outFile = path.resolve('output', `${studentId}.pdf`);

        // 检查是否需要跳过或重下
        if (await exists(outFile)) {
            const size = (await fs.promises.stat(outFile)).size;
            if (options['redownload-if-smaller'] && size < options['redownload-if-smaller']) {
                console.log(`重新下载     ${studentId}.pdf（原 ${formatBytes(size)}）`);
                await fs.promises.unlink(outFile);
            } else {
                console.log(`已存在       ${studentId}.pdf [${formatBytes(size)}]`);
                continue;
            }
        }

        if (!options['skip-pdfs']) {
            await savePdf(browser, url, outFile, cookies);
            const finalSize = (await fs.promises.stat(outFile)).size;
            console.log(`下载完成     ${studentId}.pdf [${formatBytes(finalSize)}]`);
        }
    }

    await browser.close();
    console.log(`\n全部完成！耗时 ${(Date.now() - start)/1000}s`);
    console.log(`文件已保存到 ${path.resolve('output')}`);
}

function parseScript(txt) {
    return txt.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(l => l.split(/\s+/));
}

async function savePdf(browser, urlStr, filename, cookiesHeader) {
    const page = await browser.newPage();
    if (cookiesHeader) {
        const url = urlUtils.parse(urlStr);
        const cookies = cookiesHeader.split(/ *; */).map(c => {
            const [name, value] = c.split('=', 2);
            return { name, value, domain: url.hostname, path: '/' };
        });
        await page.setCookie(...cookies);
    }
    await page.goto(urlStr, { waitUntil: 'networkidle0', timeout: 300000 });
    await page.pdf({ path: filename, format: 'A4', printBackground: true });
    await page.close();
}


function parseBytes(s) {
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
    if (!m) throw new Error('无效的大小：' + s);
    const units = { B:1, KB:1024, MB:1024**2, GB:1024**3 };
    return parseFloat(m[1]) * units[m[2].toUpperCase()];
}

function formatBytes(b) {
    const units = ['B','KB','MB','GB'];
    let i = 0;
    while (b >= 1024 && i < units.length-1) { b /= 1024; i++; }
    return b.toFixed(1) + ' ' + units[i];
}

async function exists(p) {
    try { await fs.promises.access(p); return true; } catch { return false; }
}
