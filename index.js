const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");

//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: Stripe } = require("stripe");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qfdpmw3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("assignment12").collection("users");
    const teacherRequestCollection = client
      .db("assignment12")
      .collection("teacherRequest");
    const classCollection = client.db("assignment12").collection("classes");
    const paymentCollection = client.db("assignment12").collection("payments");
    const assignmentCollection = client
      .db("assignment12")
      .collection("assignments");
    const assignmentSubmissionCollection = client
      .db("assignment12")
      .collection("assignmentSubmission");
    const reviewCollection = client.db("assignment12").collection("reviews");
    const bannerImageCollection = client
      .db("assignment12")
      .collection("bannerImages");

    //jwt related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    //middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "not authorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized" });
        }
        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      // console.log("verifyAdmin", email, user);
      if (user?.role !== "admin") {
        return res.send({ message: " unauthorized" });
      }
      next();
    };
    const verifyTeacher = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await teacherRequestCollection.findOne(query);
      if (user?.status !== "approved") {
        return res.status(403).send({ message: "unauthorized" });
      }
      next();
    };
    //user related  apis
    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: " user is already in the database" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // const query = {
    //   status: "approved",
    //   title: { $regex: req.query.search, $options: "i" },
    // };
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const query = { name: { $regex: req.query.search, $options: "i" } };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (email !== req.decoded.email) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });
    app.patch("/userInfo/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const existingImage = await usersCollection.findOne(query);
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          name: userInfo.name,
          number: userInfo.number,
          image: userInfo.image || existingImage.image,
        },
      };

      const result = await usersCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    });
    //teacher related api
    app.post("/teacherRequest", verifyToken, async (req, res) => {
      const request = req.body;
      const email = request.email;
      const filter = { email: email };
      const existingRequest = await teacherRequestCollection.findOne(filter);
      if (existingRequest) {
        const deleteLastRequest = await teacherRequestCollection.deleteOne(
          filter
        );
      }
      const result = await teacherRequestCollection.insertOne(request);
      res.send(result);
    });
    app.get("/teacherRequest", verifyToken, verifyAdmin, async (req, res) => {
      const result = await teacherRequestCollection.find().toArray();
      res.send(result);
    });
    app.patch(
      "/teacherRequest/reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await teacherRequestCollection.updateOne(
          query,
          updatedDoc
        );
        res.send(result);
      }
    );
    //set the status to approved
    app.patch(
      "/teacherRequest/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await teacherRequestCollection.updateOne(
          query,
          updatedDoc
        );

        res.send(result);
      }
    );

    app.get("/teachersStatus", verifyToken, async (req, res) => {
      const query = { status: "approved" };
      const options = {
        projection: {
          _id: 0,
          email: 1,
          status: 1,
        },
      };
      const result = await teacherRequestCollection
        .find(query, options)
        .toArray();
      res.send(result);
    });
    app.get("/users/teacher/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await teacherRequestCollection.findOne(query);
      if (user) {
        // If the user exists but no status is set, return "pending"
        if (!user.status) {
          return res.send({ status: "pending" });
        }
        // If user exists and status is set, return the actual status
        return res.send({ status: user.status, category: user.category });
      }

      // If no user is found, return "not_found"
      return res.send({ status: "not_found" });
    });

    app.get("/teacher/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await teacherRequestCollection.findOne(query);
      res.send(result);
    });

    //class related apis
    app.post("/class", verifyToken, verifyTeacher, async (req, res) => {
      const classs = req.body;
      const result = await classCollection.insertOne(classs);
      res.send(result);
    });
    app.get("/allClass", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });
    app.patch("/class/:id", verifyToken, verifyTeacher, async (req, res) => {
      const id = req.params.id;
      const aClass = req.body;
      const query = { _id: new ObjectId(id) };
      const existingImage = await classCollection.findOne(query);
      const updatedDoc = {
        $set: {
          title: aClass.title,
          price: aClass.price,
          description: aClass.description,
          image: aClass.image || existingImage.image,
        },
      };
      const result = await classCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.get("/class", async (req, res) => {
      const min = parseInt(req.query.min) || 0;
      const max = parseInt(req.query.max) || Infinity;

      const query = {
        status: "approved",
        title: { $regex: req.query.search || "", $options: "i" },
        price: { $lte: max, $gte: min }, //
      };

      if (req.query?.category && req.query.category !== "All") {
        query.category = req.query.category;
      }

      console.log("Query:", query);

      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.patch(
      "/class/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await classCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    app.patch(
      "/class/reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await classCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    app.get("/classes/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoriized access" });
      }
      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/class/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });
    app.delete("/class/:id", verifyToken, verifyTeacher, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });
    //get enrolled class for specific users
    app.get("/student/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoriized access" });
      }
      const query = { email: email };
      const options = {
        projection: {
          _id: 0,
          classId: 1,
        },
      };
      const classesId = await paymentCollection.find(query, options).toArray();
      const ids = classesId.map((item) => new ObjectId(item.classId));
      const filter = { _id: { $in: ids } };
      const options2 = {
        projection: {
          name: 1,
          title: 1,
          image: 1,
        },
      };
      const result = await classCollection.find(filter, options2).toArray();
      res.send({ classesId, result });
    });
    app.post("/assignment", verifyToken, verifyTeacher, async (req, res) => {
      const assignment = req.body;
      const result = await assignmentCollection.insertOne(assignment);
      res.send(result);
    });
    app.get("/assignment/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { classId: id };
      const result = await assignmentCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/submission", verifyToken, async (req, res) => {
      const assignment = req.body;
      const result = await assignmentSubmissionCollection.insertOne(assignment);
      res.send(result);
    });
    app.get("/checkSubmission/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoriized access" });
      }
      const query = { email: email };
      const options = {
        projection: {
          assignmentId: 1,
        },
      };
      const result = await assignmentSubmissionCollection
        .find(query, options)
        .toArray();
      res.send(result);
    });
    app.get("/checkEnrollment/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      const options = {
        projection: {
          classId: 1,
        },
      };
      const result = await paymentCollection.find(query, options).toArray();
      res.send(result);
    });
    // reviews related apis
    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });
    app.get("/reviews/:classId", async (req, res) => {
      const classId = req.params.classId;
      const query = { classId: classId };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });
    /*counting enrollments,assignments and asignment submissions*/
    app.get(
      "/teacher-stats/:id",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const id = req.params.id;
        const query = { classId: id };
        console.log("class id", id);
        const enrollmentCount = await paymentCollection.countDocuments(query);
        const assignmentCount = await assignmentCollection.countDocuments(
          query
        );
        const assignmentSubmissionCount =
          await assignmentSubmissionCollection.countDocuments(query);
        res.send({
          enrollmentCount,
          assignmentCount,
          assignmentSubmissionCount,
        });
      }
    );

    // app.post("/submit", async (req, res) => {
    //   const { email, ids } = req.body;

    // });
    // app.post("/checkEnrollment", async (req, res) => {
    //   const { email, classId } = req.body;
    //   const query = { email: email, classId: classId };
    //   const isStudent = await paymentCollection.findOne(query);
    //   if (isStudent) {
    //     res.send(true);
    //   } else {
    //     res.send(false);
    //   }
    // });

    //payment related apis
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post("/payment", verifyToken, async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      res.send(paymentResult);
    });
    //admin related apis
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      console.log("isAdmin", admin);
      res.send({ admin });
    });
    app.get("/adminStatus", verifyToken, async (req, res) => {
      const query = { role: "admin" };
      const options = {
        projection: {
          _id: 0,
          email: 1,
          role: 1,
        },
      };
      const result = await usersCollection.find(query, options).toArray();
      res.send(result);
    });
    app.post("/bannerImage", verifyToken, verifyAdmin, async (req, res) => {
      const image = req.body;
      const result = await bannerImageCollection.insertOne(image);
      res.send(result);
    });
    app.get("/bannerImage", async (req, res) => {
      const result = await bannerImageCollection.find().toArray();
      res.send(result);
    });
    app.get();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Developers");
});

app.listen(port);
