const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    //user related  apis
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log("user--->", user);
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: " user is already in the database" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/users/:id", async (req, res) => {
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
    //teacher related api
    app.post("/teacherRequest", async (req, res) => {
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
    app.get("/teacherRequest", async (req, res) => {
      const result = await teacherRequestCollection.find().toArray();
      res.send(result);
    });
    app.patch("/teacherRequest/reject/:id", async (req, res) => {
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
    });
    //set the status to approved
    app.patch("/teacherRequest/approve/:id", async (req, res) => {
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
    });

    app.get("/teachers", async (req, res) => {
      const result = await teacherCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/teacher/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await teacherRequestCollection.findOne(query);
      if (user) {
        // If the user exists but no status is set, return "pending"
        if (!user.status) {
          return res.send({ status: "pending" });
        }
        // If user exists and status is set, return the actual status
        return res.send({ status: user.status });
      }

      // If no user is found, return "not_found"
      return res.send({ status: "not_found" });
    });

    //admin related apis
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
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
