const NUM_RECENT_QUOTES = 5;

const findQuoteById = (req, res) => {
    if(req.query) {
        if(req.query.full)
            return getQuoteWithAllAttributes(req, res);
    }

    new db.Quote({ id: req.params.id }).fetch({ require: false })
    .then(quote => {
        res.send(quote ? quote.toJSON() : null);
    });
};

const getQuoteWithAllAttributes = (req, res) => {
    let _returnObj = {};

    new db.Quote({ id: req.params.id }).fetch({ require: false, withRelated: [ "title", "tags" ] })
    .then(quote => {
        if(quote == null)  {
            _returnObj = null;
            return new Promise(resolve => resolve(null));
        }

        Object.assign(_returnObj, quote.toJSON());
        
        if(quote.related("title")) {
            return new db.Title({ id: quote.related("title").get("id") })
                .fetch({ require: false, withRelated: [ "type", "authors" ]});
        }
        
        return new Promise(resolve => resolve(null));
    })
    .then(titleWithTypeAndAuthors => {
        if(titleWithTypeAndAuthors) {
            _returnObj.title.type = titleWithTypeAndAuthors.related("type").toJSON();

            _returnObj.authors = titleWithTypeAndAuthors.related("authors").toJSON();
        }
            
        res.send(_returnObj);
    })
    .catch(error => {
        res.send(error);
    })
};

const getQuotes = (req, res) => {
    let getQuotesPromise;

    if(req.query.recent)
        getQuotesPromise = new db.Quotes()
            .orderBy("date_added", "DESC")
            .query(qb => qb.limit(NUM_RECENT_QUOTES))
            .fetch();
        
    else if(req.query.favourite)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ is_favourite: true }))
            .fetch();
    
    else if(req.query.titleId)
        getQuotesPromise = new db.Quotes()
            .query(qb => qb.where({ title_id: req.query.titleId }))
            .fetch();

    else
        getQuotesPromise = new db.Quotes().fetch();

    getQuotesPromise
    .then(quotes => res.send(quotes.toJSON()))
    .catch(error => res.send(error));
};

module.exports = {
    findQuoteById,
    getQuotes
};