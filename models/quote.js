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

module.exports = {
    findQuoteById
};