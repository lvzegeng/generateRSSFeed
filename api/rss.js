const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

// title 文档的标题
// description  文档的描述  可以是 html
// link  文档的链接
// atomlink  rss 链接
// items  数据
//   title 文章标题
//   description 文章摘要或全文
//   guid 文章唯一标示, 必须唯一
//   link 指向文章的链接
const generateContent=(data)=> {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
    <channel>
        <title><![CDATA[${data.title}]]></title>
        <link>${data.link}</link>
        <atom:link href="${data.atomlink}" rel="self" type="application/rss+xml" />
        <description><![CDATA[${data.description || data.title} ]]></description>
        <generator>lzg</generator>
        <webMaster>lvzegeng@gmail.com (lvzegeng)</webMaster>
        <language>zh-cn</language>
        <lastBuildDate>${new Date()}</lastBuildDate>
        <ttl>60</ttl>
        ${
        data.items.map(item =>
            ` <item>
            <title><![CDATA[${item.title}]]></title>
            <description><![CDATA[${item.description || item.title}]]></description>
            <guid isPermaLink="false">${item.link || item.title}</guid>
            <link>${item.link}</link>
        </item>`
        )
    }
    </channel>
</rss>
    `;
}


// url 提前编码
// http://127.0.0.1:7001/?url=https%3A%2F%2Fnewsupport.lenovo.com.cn%2FdriveList.html%3Ffromsource%3DdriveList%26selname%3D%25E5%25B0%258F%25E6%2596%25B0%2520Air-14%25202020%2520(Intel%25E5%25B9%25B3%25E5%258F%25B0%25EF%25BC%259AIIL%25E7%2589%2588)&selectors=.list-center&titleSelectors=.drive-name&descriptionSelectors=.drive-detail

module.exports = async (req, res) => {

    // selectors
    // titleSelectors
    // descriptionSelectors
    const { url, selectors, titleSelectors, descriptionSelectors } = req.query;

    const browser = await puppeteer.launch({
        args: chrome.args,
        executablePath: await chrome.executablePath,
        headless: chrome.headless,
    });

    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
        if (['document', 'script', 'xhr', 'fetch'].includes(interceptedRequest.resourceType())){
            interceptedRequest.continue();
        }
        else{
            interceptedRequest.abort();
        }
    });

    await page.goto(url, {
        waitUntil: 'domcontentloaded'
    });

    await page.waitFor(selectors)

    const dimensions = await page.evaluate((selectors, titleSelectors, descriptionSelectors) => {
        const doms = document.querySelectorAll(selectors);

        const items = [];
        for (const item of doms) {
            items.push({
                title: item.querySelector(titleSelectors) && item.querySelector(titleSelectors).textContent,
                description: item.querySelector(descriptionSelectors) && item.querySelector(descriptionSelectors).innerHTML,
                // 自动生成
                link: item.querySelector(titleSelectors) && item.querySelector(titleSelectors).closest('a') && item.querySelector(titleSelectors).closest('a').href,
            });
        }

        return {
            title: document.title,
            description: document.querySelector('meta[name="description"]').content,
            items
        };
    }, selectors, titleSelectors, descriptionSelectors);

    await browser.close();

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/xml')

    res.send(generateContent({
        ...dimensions,
        link: url.replace(/&/g, '%26'), // 不能含有 &,
        atomlink: `${req.headers['x-forwarded-proto']}://${req.headers.host}${req.url}`.replace(/&/g, '%26'), // 不能含有 &
    }))
}
