// Bu dosya Cloudflare Worker (Pages Functions) olarak çalışır.
// Dosya Yolu kesinlikle şu olmalıdır: functions/api/data.js

export async function onRequest(context) {
    // context.env.DB veritabanımıza (KV Namespace) bağlanmamızı sağlar.
    const { request, env } = context;

    // YÖNETİCİ ŞİFRESİ (Sitenize girmek için kullanacağınız şifre. Bunu dilediğiniz gibi değiştirin)
    const ADMIN_PASSWORD = "admin"; 

    try {
        // --- GET İSTEĞİ (Site ilk açıldığında verileri çekmek için) ---
        if (request.method === "GET") {
            // KV'den verileri JSON string olarak okuyoruz
            const newsString = await env.DB.get("news_data");
            const upcomingString = await env.DB.get("upcoming_data");
            
            return new Response(JSON.stringify({
                news: newsString ? JSON.parse(newsString) : [],
                upcoming: upcomingString ? JSON.parse(upcomingString) : []
            }), { 
                headers: { "Content-Type": "application/json" } 
            });
        }

        // --- POST İSTEĞİ (Veri ekleme, silme, güncelleme işlemleri) ---
        if (request.method === "POST") {
            const body = await request.json();
            const action = body.action;
            const payload = body.payload;
            const authToken = request.headers.get("Authorization");

            // Yönetici yetkisi gerektiren işlemler için şifre kontrolü
            const requireAdmin = ['saveNews', 'saveUpcoming', 'deleteData', 'deleteComment'];
            if (requireAdmin.includes(action) && authToken !== ADMIN_PASSWORD) {
                return new Response(JSON.stringify({ success: false, error: "Yetkisiz işlem! Şifreniz hatalı." }), { status: 401 });
            }

            // Mevcut verileri çekelim (Değiştirmek için)
            let newsArray = [];
            let upcomingArray = [];
            
            const nStr = await env.DB.get("news_data");
            if(nStr) newsArray = JSON.parse(nStr);
            
            const uStr = await env.DB.get("upcoming_data");
            if(uStr) upcomingArray = JSON.parse(uStr);

            // --- İŞLEMLER (ACTIONS) ---

            // 1. Haber / İnceleme Ekleme ve Güncelleme
            if (action === "saveNews") {
                const existingIndex = newsArray.findIndex(n => n.id === payload.id);
                if (existingIndex > -1) {
                    // Yorumları ve görüntülenmeleri sıfırlamamak için eski veriyi yeni veriye yediriyoruz
                    payload.comments = newsArray[existingIndex].comments || 0;
                    payload.commentList = newsArray[existingIndex].commentList || [];
                    payload.views = newsArray[existingIndex].views || 0;
                    newsArray[existingIndex] = payload;
                } else {
                    newsArray.push(payload);
                }
                await env.DB.put("news_data", JSON.stringify(newsArray));
                return new Response(JSON.stringify({ success: true }));
            }

            // 2. Çıkış Tarihi Ekleme ve Güncelleme
            if (action === "saveUpcoming") {
                const existingIndex = upcomingArray.findIndex(n => n.id === payload.id);
                if (existingIndex > -1) upcomingArray[existingIndex] = payload;
                else upcomingArray.push(payload);
                
                await env.DB.put("upcoming_data", JSON.stringify(upcomingArray));
                return new Response(JSON.stringify({ success: true }));
            }

            // 3. Veri Silme (Haber veya Oyun)
            if (action === "deleteData") {
                if (payload.type === 'news') {
                    newsArray = newsArray.filter(n => n.id !== payload.id);
                    await env.DB.put("news_data", JSON.stringify(newsArray));
                } else {
                    upcomingArray = upcomingArray.filter(n => n.id !== payload.id);
                    await env.DB.put("upcoming_data", JSON.stringify(upcomingArray));
                }
                return new Response(JSON.stringify({ success: true }));
            }

            // 4. Herkese Açık Yorum Ekleme (Token Gerekmez)
            if (action === "addComment") {
                const artIndex = newsArray.findIndex(n => n.id === payload.articleId);
                if (artIndex > -1) {
                    if (!newsArray[artIndex].commentList) newsArray[artIndex].commentList = [];
                    newsArray[artIndex].commentList.push(payload.comment);
                    newsArray[artIndex].comments = newsArray[artIndex].commentList.length;
                    
                    await env.DB.put("news_data", JSON.stringify(newsArray));
                    return new Response(JSON.stringify({ success: true }));
                }
                return new Response(JSON.stringify({ success: false, error: "Haber bulunamadı" }));
            }

            // 5. Yorum Silme (Yönetici)
            if (action === "deleteComment") {
                const artIndex = newsArray.findIndex(n => n.id === payload.articleId);
                if (artIndex > -1 && newsArray[artIndex].commentList) {
                    newsArray[artIndex].commentList.splice(payload.commentIndex, 1);
                    newsArray[artIndex].comments = newsArray[artIndex].commentList.length;
                    await env.DB.put("news_data", JSON.stringify(newsArray));
                    return new Response(JSON.stringify({ success: true }));
                }
            }

            // 6. Görüntülenme Arttırma (Herkese açık, otomatik olur)
            if (action === "updateViews") {
                const artIndex = newsArray.findIndex(n => n.id === payload.id);
                if (artIndex > -1) {
                    newsArray[artIndex].views = (newsArray[artIndex].views || 0) + 1;
                    await env.DB.put("news_data", JSON.stringify(newsArray));
                }
                return new Response(JSON.stringify({ success: true }));
            }

            return new Response(JSON.stringify({ success: false, error: "Geçersiz işlem" }));
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            status: 500, headers: { "Content-Type": "application/json" } 
        });
    }
}