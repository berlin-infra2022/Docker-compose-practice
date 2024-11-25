const rootDir = require('../../util/path');

const { printDateTime } = require('../../util/printDateTime');
const { performance } = require('perf_hooks');
const db = require('../../util/database');
const { saveBase64Image } = require('../../util/saveBase64Image');
const { imageUrlToBase64 } = require('../../util/imageUrlToBase64');

// Express Request Handler POST route http://localhost:3001/records/save-user-celebrity
exports.saveUserCelebrity = (req, res) => {
    printDateTime();
    const requestHandlerName = `saveUserCelebrity`;
    console.log(`\nJust received an HTTP request for:\n${requestHandlerName}\n`);
    
    const { userId, celebrityName, imageUrl, imageBlob, metadata, dateTime } = req.body;

    console.log(`\nRequest Handler: `, requestHandlerName, `\n`, `userId: `, userId, `\ncelebrityName: `, celebrityName, `\nimageUrl: `, imageUrl, `\nimageBlob: `, imageBlob, `\nmetada: `, metadata, `\ndateTime: `, dateTime);
    console.log(`\ntypeof userId: `, typeof userId, `\ntypeof celebrityName: `, typeof celebrityName, `\ntypeof imageUrl: `, typeof imageUrl, `\ntypeof imageBlob: `, typeof imageBlob, `\ntypeof metada: `, typeof metadata, `\ntypeof dateTime: `, typeof dateTime, `\n`);

    // JWT Authorization checks
    if (userId !== req.userData.userId) {
        return res.status(403).json({
          success: false, 
          status: { code: 403 },
          message: `Unauthorized`
        })
      }

    let userIdInt = parseInt(userId, 10);
    if (isNaN(userIdInt)) {
      return res.status(400).json({ error: 'Invalid userId, must be a number' });
    }
  
    let base64Metadata = (typeof metadata === 'string') ? metadata : JSON.stringify(metadata);

    const start = performance.now();
    
    return db('celebrity_record')
    .insert({
        user_id: userId,
        celebrity_name: celebrityName,
        image_url: imageUrl,
        image_blob: imageBlob,
        metadata: metadata,
        date_time: dateTime
    })
    // .returning('*')
    .then((result) => {
        if (!result) {
            res.status(500).json({
                success: false,
                status: { code: 500 },
                message: `Failed during savingUserCelebrity postgres op`
            });
        }

        console.log('\nProceeding to save base64 image to Node server.\n');
        // Allow Promise chaining by return
        return saveBase64Image(base64Metadata, userIdInt);
    })
    .then((saveBase64Results) => {
        const end = performance.now();
        const duration = end - start;
        console.log(`\nPerformance for saveBase64Image locally to Node.js server is: ${duration}ms\n`);
        
        res.status(200).json({
          success: true,
          status: { code: 200 },
          message: `saveUserCelebrity postgresql op completed successfully!`,
          performance: `Performance: ${duration}ms`
        });
    })
    .catch((err) => {
        console.error(`Error in saving image:\n`, err, `\n`);
        res.status(500).json({
          success: false,
          status: { code: 500 },
          message: `Failed during saving celebrity image to server`,
          error: err.toString()
        });
    });
};

/* PostgreSQL 
SELECT 
    u.id AS user_id,
    cr.id AS celebrity_record_id,
    cr.image_url,
    cr.image_blob,
    cr.date_time
FROM
    users u
JOIN
    celebrity_record cr ON u.id = cr.user_id
WHERE
    u.id = 1
    AND cr.id IN (
        SELECT cr.id
        FROM celebrity_record cr 
        WHERE cr.user_id = 1
        ORDER BY cr.date_time DESC
        LIMIT 10
    )
ORDER BY
    cr.date_time DESC;
*/
// Express Request Handler POST route http://localhost:3001/records/get-user-celebrity
exports.getUserCelebrity = (req, res) => {
    printDateTime();
    const start = performance.now();

    const requestHandlerName = `rootDir/controllers/celebrityRecords.js\ngetUserCelebrity()`;
    
    const { userId } = req.body;

    if (!userId || typeof userId !== 'number') {
        return res.status(400).json({ 
          success: false, 
          status: { code: 400 }, 
          message: `Invalid inputs for userId: ${userId} undefined`, 
        });
    }

    const subquery = db('celebrity_record as cr')
    .select('cr.id')
    .where('cr.user_id', userId)
    .orderBy('cr.date_time', 'desc')
    .limit(10);

    const mainQuery = db('users as u')
        .join('celebrity_record as cr', 'u.id', 'cr.user_id')
        .select(
            'u.id as user_id',
            'cr.id as celebrity_record_id',
            'cr.celebrity_name',
            'cr.image_url',
            'cr.image_blob',
            'cr.date_time'
        )
        .where('u.id', userId)
        .whereIn('cr.id', subquery)
        .orderBy('cr.date_time', 'desc');

    // To see the generated SQL
    mainQuery.toSQL().toNative();

    // Execute the query
    mainQuery.then(rows => {
        const end = performance.now();
        const duration = end - start;

        // console.log(`\nRequest Handler: ${requestHandlerName}\nrows: \n`)
        // console.log(rows);
        console.log(`\nPerformance for Request Handler:\n${requestHandlerName}:\n${duration}ms\n`);

        return res.status(200).json({ 
            success: true, 
            status: { code: 200 }, 
            message: `Transaction for Express RequestHandler: ${requestHandlerName} completed!`, performance: `Performance for db.transaction(trx) => getUserCelebrity (records) is: ${duration}ms`,
            celebrityData: rows
        });
    }).catch(err => {
        console.error(`\nError in Request Handler:\n${requestHandlerName}\nError:\n${err}\n`);

        return res.status(500).json({ 
            success: false, 
            status: { code: 500 }, 
            message: `Failed Express RequestHandler ${requestHandlerName}Internal Server Error`, 
            error: err.toString()
          });
    });
};