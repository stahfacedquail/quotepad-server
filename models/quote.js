const { Tag, Title } = require("../db/main");

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

const updateQuote = (req, res) => {
    let updates = {};
    console.log(req);

    if("is_favourite" in req.body)
        updates.is_favourite = req.body.is_favourite instanceof Boolean ? req.body.is_favourite : new Boolean(req.body.is_favourite);

    new db.Quote({ id: req.params.id }).save(updates)
    .then(updatedModel => res.send(updatedModel.toJSON()))
    .catch(error => res.send(error));
};

const deleteQuote = (req, res) => {
    //delete quote-tags
    //search for zombie tags and delete
    //delete quote
    //ascertain whether zombie title then delete corresponding title-author entries
    //then delete title
    //search for zombie authors and delete

    let quoteToBeDeleted;
    let returnObj = {
        success: true,
        lastQuoteInTitle: false
    };

    new db.Quote({ id: req.params.id }).fetch()
    .then(obj => quoteToBeDeleted = obj.toJSON())
    .then(() => {
        return bookshelf.transaction(t => {
            return new db.QuoteTag()
            .where({ quote_id: req.params.id })
            .destroy({ transacting: t, require: false })
            .then(() => {
                return knex.raw(
                    "SELECT quote_tags.tag_id, count(quote_tags.tag_id) " +
                    "FROM tags LEFT JOIN quote_tags " +
                    "ON tags.id = quote_tags.tag_id " +
                    "GROUP BY quote_tags.tag_id " +
                    "HAVING COUNT(quote_tags.tag_id) = 1;"
                );
            })
            .then(quotelessTags => {
                quotelessTags = quotelessTags.rows;

                if(quotelessTags.length == 0)
                    return new Promise(resolve => resolve(null));

                quotelessTags = quotelessTags.map(tag =>
                    new db.Tag()
                    .where({ id: tag.tag_id })
                    .destroy({ transacting: t })
                );

                return Promise.all(quotelessTags);
            })
            .then(() => {
                return new db.Quote()
                .where({ id: req.params.id })
                .destroy({ transacting: t });
            })
            .then(() => {
                return new db.Quote()
                .where({ title_id: quoteToBeDeleted.title_id })
                .count("id");
            })
            .then(numQuotesInTitle => {
                console.log(`Number of quotes in title ${quoteToBeDeleted.title_id}`, numQuotesInTitle);

                if(numQuotesInTitle == 1) {
                    returnObj.lastQuoteInTitle = true;

                    return new db.TitleAuthor()
                        .where({ title_id: quoteToBeDeleted.title_id })
                        .destroy({ transacting: t})
                        .then(() => {
                            return new Title({ id: quoteToBeDeleted.title_id }).destroy({ transacting: t});
                        });
                }

                return new Promise(resolve => resolve(null));
            })
            .then(titleDeleted => {
                if(titleDeleted) {
                    return knex.raw(
                        "SELECT title_authors.author_id, COUNT(title_authors.author_id) " +
                        "FROM authors LEFT JOIN title_authors " +
                        "ON authors.id = title_authors.author_id " +
                        "GROUP BY title_authors.author_id " +
                        "HAVING COUNT(title_authors.author_id) = 1;"
                    );
                }

                return new Promise(resolve => resolve(null));
            })
            .then((titlelessAuthors) => {
                if(titlelessAuthors && titlelessAuthors.rows.length > 0) {
                    titlelessAuthors = titlelessAuthors.rows.map(author =>
                        new db.Author()
                        .where({ id: author.author_id })
                        .destroy({ transacting: t})
                    );

                    return Promise.all(titlelessAuthors);
                } 
                
                return new Promise(resolve => resolve(null));
            });
        });
    })
    .then(() => {
        res.send(returnObj);
    })
    .catch(error => {
        console.log("ERROR!", error);
        returnObj.success = false;
        returnObj.error = error;
        res.send(returnObj);
    });
};

module.exports = {
    findQuoteById,
    getQuotes,
    updateQuote,
    deleteQuote
};